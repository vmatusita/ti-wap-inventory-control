ultracode

# OS-F19 (ultracode) — Auditoria de regras de negócio e verificação de fluxos (spec ↔ banco ↔ app ↔ produção)

Ordem **executável e autocontida** (24/07/2026). Depois de F0→F18 e nove dias de produção (~1.600 ativos, 5 filiais), as regras de negócio vivem em quatro camadas — `docs/ESPECIFICACAO.md` (§3–§10, com emendas F14/F15/F18), as migrations `0001`–`0053` (máquina de estados, triggers, RPCs, views, RLS), o app (`src/lib/actions|validators|queries`) e as decisões registradas (`docs/DECISOES.md`) — e **nenhum documento diz, regra a regra, ONDE cada uma está implementada e QUE PROVA garante que ela continua valendo**. O custo desse vazio já apareceu duas vezes: na F12 (66 commits em produção sem smoke → 9 defeitos, dois altos) e na F15 (roteiro SQL defasado derrubou o job `banco` do CI silenciosamente). Decisão do Johnny (24/07/2026): **auditoria completa de conformidade + verificação executável dos fluxos, com correção das divergências confirmadas na própria ordem** (precedente F12). Objetivo em uma linha: **`docs/MATRIZ-REGRAS.md` viva em que toda regra tem localização e prova executada; todo fluxo da operação exercitado de ponta a ponta no nível de dados; divergências confirmadas corrigidas (código direto, migrations pelo runbook); e produção conferida por SELECTs 100% read-only (estado derivado × histórico), com contagens coladas no relatório.**

**Modo autônomo com acesso total (CLAUDE.md).** Você roda de forma autônoma: **ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) spec (com emendas) / CLAUDE.md / convenções do repositório; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

**Produção e git.** Trabalho **direto na `main`** (precedente F14–F18), commits pequenos e frequentes; **push = deploy automático (Vercel)**. Produção entra nesta ordem de DUAS formas, e só duas: (a) **leitura** — SELECTs de consistência via MCP, zero escrita; (b) **correção de divergência confirmada** — migrations novas a partir da **`0054`** pelo `docs/RUNBOOK-BANCO.md` (ENSAIO primeiro, com medições; produção depois, com backup/export das tabelas afetadas quando a migration tocar dado). Correção de DADO em produção só quando for mecânica, derivável de um bug corrigido nesta ordem e reversível (precedente do retroativo C3/F15): backup em `scratchpad/f19/` + antes=depois conferido; qualquer outro caso vira pendência no relatório com o SQL proposto, sem executar. Proibido sempre: force push, `git reset --hard`, `git clean`, editar migration já aplicada, deletar/pular/enfraquecer teste ou cenário de roteiro para passar, seed/reset fictício contra produção. Se o classificador barrar uma operação (o "gate" do runbook): não insista — siga o fluxo de handoff humano documentado lá (migration no repo + SQL em `scratchpad/` + instrução de 2 minutos no relatório).

**Dados e segredos.** Nenhum nome de colaborador real, patrimônio real ou linha de planilha da WAP em teste, roteiro, exemplo, comentário, na matriz ou no relatório — exemplos sempre fictícios (`WAP0001234`/"Fulano"). Evidência de produção = **contagens e agregados**; quando uma lista detalhada for indispensável para o Johnny agir, grave-a em `scratchpad/f19/` (precedente F15), nunca em `docs/`. Roteiros SQL são `begin; … rollback;` no stack local ou no ENSAIO — prova destrutiva nunca em produção.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre (atenção: a lista de fases dele parou na F7 — o estado real está em `README.md` e `docs/prompts/README.md`).

---

## §0 — Mapa do terreno (levantado em 24/07/2026 — confirme no gate)

1. **Normas, em ordem de autoridade:** `docs/ESPECIFICACAO.md` (§3 acesso · §4 máquina de estados, 15 tipos × 9 estados · §5 modelo/vocabulários/patrimônio · §6 telas · §7 relatórios · §8 regras 1–9 + 8.1 termos · §10 carga/import) > `docs/PLANEJAMENTO.md` > código. **Nuance central desta ordem:** `docs/DECISOES.md` (append-only, ~386 KB — NÃO leia inteiro no contexto principal; consulte por grep/subagente quando um veredito depender de decisão) registra divergências **deliberadas**. Comportamento diferente da spec mas coberto por decisão registrada/emenda **não é divergência**: é **doc desatualizada** — o conserto é emendar a spec citando a decisão, nunca "corrigir" o código de volta.
2. **Onde as regras moram (1ª linha = Postgres, por spec §9):** máquina de estados e derivação de estado em `aplicar_movimentacao` + `status_apos_movimentacao` — **versões vigentes vêm de recriações sucessivas** (`0004` → `0023` snapshot/estorno → `0045` manutenção → `0047` troca → `0051` pendências de item): parta SEMPRE da última definição aplicada, nunca da `0004`. Saldos de itens em `0015` (+`0027` Total/Estoque). RPCs: `devolver_ao_fornecedor` (`0045`/`0047`), `importar_ativos_substituir` (`0032`→`0048`, hardening `0040`), relatório/as-of (`0011`, `0016`, `0022`, `0045`/`0047`). Views: `v_estoque_atual`, `v_pendencias` (vigente `0049`), leitura de pendências de item (`0052`). RLS/grants/domínios: `0005`, `0012`, `0024`, `0038`, `0041`. 2ª linha = app: `src/lib/validators/**` (Zod), `src/lib/actions/**`, `src/lib/queries/**`, `src/lib/dominio.ts`.
3. **Verificação que JÁ existe (mapeie antes; não duplique):** 7 roteiros em `supabase/tests/` (`maquina_estados`, `troca`, `manutencao_fornecedor`, `pendencias_item`, `pendencias_import_termo`, `itens_quantidade`, `dominios_login`) — rodam no job `banco` do CI (Postgres + todas as migrations + cada `*.sql`, falha em `✗`); **1.018 testes Vitest** (funções puras); smoke logado `scripts/smoke/smoke-prod.mjs` (baseline F12: 33 OK); gate de build `scripts/verificar-actions-build.mjs`; guardas de seed (`scripts/env-guard.ts`, lista `REFS_DE_PRODUCAO`).
4. **Ambientes:** MCP Supabase → PRODUÇÃO `pbtjcalbmepmrqzprusb` e ENSAIO `sgmvldiizsrjbxzzpmhh` (runbook). Roteiros pelo melhor caminho disponível (precedente F17·A1): Docker/`supabase start` → réplica local do job `banco`; senão ENSAIO via `execute_sql` com provas por SELECT que retornam LINHAS (o MCP engole NOTICE/WARNING); senão análise estática + o CI do push como prova final. Registre qual caminho usou.
5. **Limite conhecido (declare, não contorne):** sem E2E visual autenticado (login wall — o agente não digita senha; precedente F12–F18). Fluxo de tela se prova no **nível de dados**: as MESMAS views/queries/actions que a tela usa. O que só um clique humano prova vai para "o que este relatório NÃO prova".
6. **A divergência do ledger de migrations é CONHECIDA e documentada** (runbook, seção "Divergência": `0031`–`0037`/`0039`/`0040` aplicadas fora do ledger; `0029` não existe). Não re-flagre; confira apenas se nada NOVO divergiu (`list_migrations` × `supabase/migrations/`).

## §1 — Orquestração

### 1.0 GATE de entrada

(a) Working tree **limpo na `main`** e sincronizado com `origin` (este arquivo, untracked, não conta). Sujo → PARE e reporte. (b) Baseline verde HOJE: `npm run lint && npm run test && npm run build` — registre a contagem de testes (última conhecida: 1.018); vermelho → PARE e reporte. (c) Inventário de capacidades, registrado no relatório: MCP Supabase enxerga ENSAIO e PRODUÇÃO (`list_projects`/`list_migrations`)? MCP Vercel? Docker/`supabase start`? `gh` autenticado? As provas se adaptam ao que existir (§0.4). (d) `ls supabase/migrations/` — última conhecida **`0053`**; se houver mais, leia as novas antes de auditar (o terreno mudou); migrations desta ordem começam onde a numeração estiver. (e) Leia ANTES de auditar: `docs/RUNBOOK-BANCO.md`, TODOS os roteiros de `supabase/tests/`, `docs/prompts/README.md` (o que cada fase entregou) e `docs/ARQUITETURA.md`. (f) ENSAIO com migrations em dia (`list_migrations`); defasado → aplique lá as faltantes ANTES (é o ambiente de prova).

### 1.1 Grafo

    ONDA 1 (∥, read-only)            ONDA 2 (provas)                 ONDA 3 (∥, read-only)    ONDAS 4–5 (orquestrador)
    A1..A7: inventário por área  →   roteiros/testes novos +     →   produção: SELECTs de →   correções (código; migrations
    → matriz rascunho                fluxos E2E no ensaio;           consistência +           0054+ pelo runbook) → revisão
    (regra·fonte·onde·prova)         matriz ganha vereditos          advisors + smoke         adversarial (5 lentes) → emendas
                                                                                              → re-verificação → rollout §R → docs

A ONDA 3 pode rodar em paralelo com a 2 (é read-only e independente). As correções (onda 4) só começam com a matriz fechada — é ela que separa bug de doc-desatualizada. Frentes de correção que editem arquivos em paralelo → worktrees isolados (precedente F10).

### 1.2 Regras globais

1. **Escopo fechado. Auditar ≠ melhorar:** achado que não é regra de negócio (UX, performance, estilo, refactor) vai para o backlog do relatório — nenhuma linha muda por ele. Backlog já documentado (F5 §5.x, F6C, dívida K, reconciliação do ledger…) não é achado.
2. **Zero dependência nova** (`package.json` byte a byte igual), zero serviço novo, zero role novo, custo R$ 0. `src/components/ui/**` intocado.
3. Convenções CLAUDE.md integrais: pt-BR em UI/erros/commits; Server Components por padrão; escritas via Server Actions com Zod; snake_case no banco; toda alteração de banco em migration NOVA.
4. **Invariante da ordem: nenhum comportamento muda, exceto divergência confirmada e corrigida** — cada uma listada na matriz com o commit. Contagens de relatório/pendências idênticas antes/depois de cada correção, salvo quando a correção for exatamente sobre a contagem (documente antes → depois). Snapshots congelados continuam abrindo; `schema: 2` intacto.
5. **Prova > opinião.** Veredito `CONFORME` exige prova executada (roteiro ✓, teste verde, SELECT com resultado colado). Onde só leitura de código for possível, o veredito é `CONFORME-POR-LEITURA` — nunca disfarce um pelo outro.
6. Roteiro/teste que asserir comportamento antigo após uma correção é **atualizado** com a mudança explicada em comentário — nunca apagado/enfraquecido. Contagem de testes só sobe.
7. Commits pt-BR conventional: `docs(f19): matriz de regras de negócio`, `fix(f19): <regra> — <o que era>`, `test(f19): roteiro de transições inválidas`.

### 1.3 Propriedade de arquivos

| Fase | Arquivos |
|---|---|
| Ondas 1–3 (auditoria) | read-only no código; escrevem só `docs/MATRIZ-REGRAS.md` (o orquestrador consolida), `supabase/tests/**` (roteiros novos), testes Vitest novos, `scratchpad/f19/**` |
| Onda 4 (correções) | o que cada correção exigir — uma frente por vez na mesma árvore, OU worktrees isolados se paralelo |
| Orquestrador | `docs/DECISOES.md`, `docs/ESPECIFICACAO.md` (emendas), `README.md`, `CHANGELOG.md`, `docs/prompts/README.md`, `docs/RELATORIO-F19.md`, rollout, push |

---

## §M — A matriz (`docs/MATRIZ-REGRAS.md`, o entregável central)

Uma linha por regra, com ID estável para citação futura (`R-<área>-<nn>`, ex.: `R-ME-04`). Colunas: **ID · Regra (enunciado curto) · Fonte (spec §/migration/decisão) · Onde vive (objeto do banco e/ou arquivo do app, conferido) · Prova (roteiro/teste/SELECT + como reexecutar) · Veredito · Ação**. Vereditos: `CONFORME` · `CONFORME-POR-LEITURA` · `DIVERGENTE` (bug — o sistema faz diferente da norma vigente) · `DOC-DESATUALIZADA` (código certo por decisão registrada; spec emendada) · `NAO-IMPLEMENTADO` (a norma promete, não existe em camada nenhuma) · `SEM-PROVA` (regra sem cobertura executável — a ação é criar a prova nesta ordem, ou justificar por que não dá). Ações: `corrigido (commit …)` · `emenda de doc (commit …)` · `roteiro/teste novo (…)` · `backlog` · `—`. Cabeçalho do arquivo: data da auditoria, baseline (commit + contagem de testes), como reexecutar cada tipo de prova e a legenda acima. **Regra de completude: regra sem linha na matriz = auditoria incompleta** (lente nº 1 da revisão adversarial).

## §A — Onda 1: inventário por área (subagentes ∥, read-only; cada um devolve linhas da matriz)

Cada frente lê a norma + o código vigente e devolve: as regras da área (enunciado + fonte), onde cada uma vive (objeto/arquivo real, conferido — não "provavelmente"), prova existente (roteiro/teste que já cobre, com o cenário apontado), prova faltante e suspeitas de divergência com evidência preliminar. **Toda regra dessas fontes entra, inclusive as que só existem em migration** (ex.: rate limit da senha, `0025`) **ou só em decisão** (grep dirigido no `DECISOES.md`).

- **A1 — Máquina de estados, estorno e ajuste.** Spec §4 (tabela completa de transições, 15 tipos × 9 estados, emendas F14/F15) + §8 regras 2/6/7. Vigente: `aplicar_movimentacao`/`status_apos_movimentacao` pós-`0051`. Inclui: estorno só da última efetiva e restauração COMPLETA (status/colaborador/setor/filial + pendência via snapshot `0023` + pendências de item `0051`), `ajuste` exige justificativa, imutabilidade de `movimentacoes`, alerta de duplicata §8.7 (avisa, não trava), `troca`/`devolucao_fornecedor` gravadas só pela RPC.
- **A2 — Fluxos de movimentação no app.** Spec §6 (nova movimentação em lote ≤30, compra single/lote/faixa, devolução ao fornecedor com substituto, kits F12 — aplicar sobrescreve os 4 campos, checklist avisa e nunca bloqueia, kit é cópia) + §8 regras 3/8/9. Para cada regra: Zod × check do banco — **onde só o Zod protege uma regra crítica, isso é linha própria da matriz** (a spec §9/CLAUDE.md mandam o Postgres ser a 1ª linha; exceção só com decisão registrada — ex.: service tag obrigatória, F15).
- **A3 — Itens por quantidade.** Spec §5 (`itens`, `lancamentos_item`, imutabilidade/estorno por lançamento inverso) + F12 (estoque mínimo: compara com o consolidado, `0` = sem alerta, igual ao mínimo não alerta) + `0015`/`0027` (saldo e atrelados nunca negativos, "faltam N" = max(0, atrelados−saldo)).
- **A4 — Import e carga.** Spec §10/§10.2 + migrations `0031`→`0048`: só *Substituir tudo*; canonicalização e par patrimônio+service tag; pendências que o import ABRE (`sem patrimônio físico`, `sem service tag`) e as que NÃO abre (termo `0049`, item de devolução F18); compra de abertura = baseline fora das Entradas (`0036`); hostname → patrimônio; hardening/grants `0040`; o gate destrutivo do runbook.
- **A5 — Termos e pendências.** Spec §8.1 (7 modelos, snapshot jsonb + Storage privado, versão única por termo, `gerado`/`enviado`/`nao`/não-informado cobram — só `sim` encerra) + §5 Nomenclatura/emenda F18 (`pendencias_item`: por movimentação, colaborador da época, desfecho manual individual/lote, resolvida permanece na ficha; `triagem_ok` não toca `ativos.pendencia`; fila = fusão das duas fontes).
- **A6 — Acesso e segurança de dados.** Spec §3 + CLAUDE.md: duas portas, nível único (sem roles), domínios corporativos no trigger (`0041` + `src/lib/auth/dominios-email.ts`), senha de visualização (scrypt nativo, cookie httpOnly válido só em `/relatorios/**`, revogação no request seguinte, rate limit `0025`), RLS de TODAS as tabelas, `security_invoker` das views, grants das RPCs (escrita = authenticated-only), service_role nunca em client, viewer NUNCA alcança termos/pendências/admin/telas de operador.
- **A7 — Relatórios e snapshots.** Spec §7/§7.1: 3 grupos e KPIs; Entradas incluem `troca` rotulada mas nenhuma contagem de compras a inclui; estornos sinalizados sem mudar contagem; as-of (`rel_estoque_asof` — par movimentação+estorno se anula); snapshot imutável/versionado (`schema: 2`, regerar = versão nova); semana dom–sáb; carga do go-live filtrada (F6A); acesso por senha nas rotas de relatório.

## §B — Onda 2: provas e fluxos (a matriz ganha vereditos)

**B1 — Cobertura nova onde a matriz acusar `SEM-PROVA` executável.** Roteiros SQL novos em `supabase/tests/` (padrão `begin;…rollback;` com ✓/✗ dos existentes) e/ou testes Vitest de função pura. Mínimo que esta ordem exige provado NO BANCO (se um roteiro existente já cobre, aponte o cenário — não duplique):
1. **Transições inválidas rejeitadas pelo banco**, chamando o INSERT direto (sem UI): amostra sistemática cobrindo cada estado de origem × pelo menos um tipo proibido (saída de `descartado`, devolução de `em_estoque`, `triagem_ok` de `em_uso`, `devolucao_fornecedor` fora de `em_manutencao`, `transferencia` de `descartado`/`devolvido_fornecedor`, `reserva` de `em_uso`, segunda `compra` no mesmo ativo…). A tabela do §4 inteira vira casos — positivos E negativos.
2. **Ciclos completos:** compra→saída→devolução (com itens faltantes)→triagem_ok→estoque; empréstimo→fim; reserva→saída; manutenção→retorno E manutenção→`devolucao_fornecedor`+substituto por `troca` (RPC atômica: colisão → rollback total); defasado; descarte; transferência muda a filial mantendo o estado.
3. **Estorno de cada tipo efetivo** que o sistema grava: estado/colaborador/setor/filial/pendências/termo restaurados; só a última efetiva; estorno de estorno negado.
4. **Obrigatoriedades no nível certo:** saída/empréstimo exigem colaborador OU setor + motivo; devolução exige motivo + checklist; `ajuste` exige justificativa; `envio_manutencao` exige `chamado_fornecedor` — para cada uma, registre na matriz se vale no banco, só no Zod, ou nos dois.
5. **Itens por quantidade:** tentativas diretas de negativar saldo/atrelados falham; falta calculada certa; estorno por inverso; estoque mínimo (consolidado; igual não alerta).
6. **Vocabulários:** motivos/termo/estados aceitos = exatamente os da spec §5 (enums do banco × De→Para do app; teste puro para `dominio.ts`).

**B2 — Fluxos no ensaio (nível de dados, evidência textual no relatório):** confirme que os cenários E2E dos aceites das fases anteriores continuam valendo (não regrediram): pendência de item F18 (devolução→aberta com colaborador da época→saída para outro→resolver em lote→permanece na ficha), import de startup com as dispensas, termo gerado→pendência até `sim`. Use as MESMAS queries que as telas usam.

**B3 — Vitest:** funções puras novas só onde a matriz pedir (validators, `dominio.ts`, canonicalização, url-params). Proibido montar harness de UI/Server Actions (stack fechada; login wall é limite documentado, §0.5).

## §C — Onda 3: produção read-only (MCP `execute_sql`, SELECTs apenas — contagens no relatório, detalhe sensível em `scratchpad/f19/`)

1. **Estado derivado × histórico:** o estado atual de cada ativo (`status`/`colaborador`/`setor`/`filial`) bate com o replay das movimentações efetivas? Use as funções do próprio sistema (`rel_estoque_asof` de hoje × `ativos`; `status_apos_movimentacao` sobre a última efetiva). Divergência = contagem + amostra em scratchpad. Cuidado com o legado de import (baseline `0036`): separe "divergência real" de "história iniciada por carga" antes de acusar.
2. **Histórico legal:** movimentação cujo tipo era proibido no estado em que o ativo estava (replay); estorno apontando não-última; `ajuste` sem observação; `envio_manutencao` pós-F14 sem `chamado_fornecedor` (check é `NOT VALID` — conte o legado separado); `troca`/`devolucao_fornecedor` órfãs do fluxo da RPC (sem `substitui_ativo_id` correspondente).
3. **Identidade:** par patrimônio+service tag duplicado; dois ativos sem service tag com o mesmo patrimônio (proibido §5); patrimônio fora do canônico sem a pendência correspondente.
4. **Pendências:** buckets das views × contagem direta; pendência de item órfã (movimentação estornada/inexistente), resolvida sem desfecho/quem/quando, aberta apontando devolução de import; `%itens faltantes%` em `ativos.pendencia` (F18 promete zero).
5. **Termos:** `termo_assinado` fora do vocabulário; `gerado` sem linha em `termos_gerados`.
6. **Itens:** saldo/atrelados negativos (não podem existir); `falta` × fórmula.
7. **Segurança:** `get_advisors` (security + performance) — 0 achados NOVOS vs baseline das atas; grants das RPCs de escrita (authenticated-only); RLS ligada em toda tabela do schema public.
8. **Ledger:** `list_migrations` × `supabase/migrations/` — nada NOVO fora do já documentado (§0.6).
9. **Smoke:** `node scripts/smoke/smoke-prod.mjs` (leia antes `scripts/smoke/README.md`) — baseline ou melhor.

Cada check vira linha da matriz (a regra por trás dele) e, se acusar, um achado classificado no §D. **Nenhuma escrita em produção nesta onda — nem "só um update pequeno".**

## §D — Onda 4: correções (só divergência confirmada, com a matriz fechada)

Classifique cada achado e aja pela régua — prioridade: corrompe dado ou fura acesso > regra de operação errada > cobertura faltante > doc:
1. **Bug de app** → corrija na causa raiz, com o teste/roteiro que teria pegado escrito junto (test-first quando couber), diff mínimo.
2. **Bug de banco** (função/trigger/view/RLS) → migration nova recriando a partir da definição VIGENTE com diff mínimo comentado; ENSAIO primeiro com medições; produção pelo runbook (backup antes se tocar dado); `npm run db:types` se o schema mudar.
3. **Doc desatualizada** (código certo por decisão registrada) → emenda na spec/ajuda citando a decisão e a data; NUNCA "corrigir" o código de volta.
4. **Dado inconsistente em produção** → régua do preâmbulo: mecânico + derivável + reversível → corrige com backup e antes=depois; senão pendência com o SQL proposto.
5. **Não-implementado** → pequeno e inequívoco (a spec define exatamente o comportamento) → implemente; se abrir desenho novo (tela nova, coluna de uso amplo), vira backlog priorizado com proposta — esta ordem não inventa feature.

Achado sem certeza após investigação honesta → `scratchpad/f19/` + pendência no relatório, nunca chute em produção.

## §V — Verificação (rode de verdade, a cada incremento)

1. `npm run lint && npm run test && npm run build` verdes sempre; itere até passar; causa raiz, nunca supressão.
2. **TODOS os roteiros** de `supabase/tests/` com zero ✗ num Postgres com TODAS as migrations (regra F17 do runbook: mexeu em função/trigger/RPC → roda todos), pelo melhor caminho do §0.4.
3. Matriz: nenhuma linha sem veredito; nenhum `DIVERGENTE`/`NAO-IMPLEMENTADO` sem ação registrada.
4. **Revisão adversarial** (entre correções e rollout): cinco lentes independentes em contexto fresco, refutação por padrão, apontando só lacuna de correção/requisito (não estilo):
   (1) **completude** — releia §3–§10 da spec + CLAUDE.md + migrations-com-regra CONTRA a matriz: regra sem linha = achado;
   (2) **prova real** — amostre ≥20 linhas `CONFORME`: a prova citada existe, foi executada e prova AQUILO? veredito por leitura onde dava para executar = achado;
   (3) **correções** — diff mínimo? causa raiz? nada "corrigido" contra decisão registrada? nenhum teste/roteiro enfraquecido?
   (4) **produção e dados** — a onda 3 foi mesmo 100% read-only (audite os comandos executados)? contagens fecham? nenhum patrimônio/nome real vazou para `docs/`/testes/matriz (grep no diff)?
   (5) **regressão e viewer** — roteiros todos ✓, contagens de relatório/pendências intactas (salvo correção documentada), snapshots antigos abrem, RLS/grants sem exposição nova ao visualizador por senha.
   Achado real → corrija → re-revise até limpar.

## §R — Rollout (orquestrador, só depois de tudo verde)

1. União verde local (lint/test/build + roteiros + matriz fechada).
2. Se houve migration: ENSAIO → PRODUÇÃO pelo runbook, com backup quando tocar dado e verificação pós-apply COLADA no relatório.
3. Push na `main` → deploy Vercel: conferir **READY** + `get_runtime_errors` limpo (MCP Vercel, padrão F15–F18).
4. GitHub Actions **verde** (job `banco` incluso): `gh run watch`; sem `gh` → pendência com o link.
5. Re-rode o smoke de produção; contagens finais batem com a matriz.

## §Docs — Documentação e relatório final

- `docs/MATRIZ-REGRAS.md` — completa e reexecutável (é o entregável central).
- `docs/DECISOES.md` — ata F19: decisões da auditoria, achados aceitos como estão e por quê.
- Emendas de spec/ajuda dos `DOC-DESATUALIZADA` (cada uma citando a decisão-fonte).
- `CHANGELOG.md` + `README.md` (status F19) + `docs/prompts/README.md` (linha F19 na tabela).
- `docs/RELATORIO-F19.md` em pt-BR: sumário executivo (regras auditadas · conformes · corrigidas · emendas · pendências), achados por severidade com **evidência real colada** (saídas de comandos, ✓ dos roteiros, contagens de produção), backlog, seção **"o que este relatório NÃO prova"** (padrão F12–F18) e próximos passos.
- Resposta final no chat: resumo de ~10 linhas em pt-BR com os números da matriz e o checklist abaixo autoverificado.

**Checklist de aceite da ordem (autoverifique item a item no relatório):**
- [ ] Matriz completa (7 áreas), toda linha com fonte, localização conferida, prova e veredito.
- [ ] Zero `SEM-PROVA` executável restante: cada um virou roteiro/teste, ou tem justificativa explícita.
- [ ] Roteiros novos cobrindo transições inválidas direto no banco + ciclos + estornos (§B1) — TODOS os roteiros ✓.
- [ ] Onda de produção 100% read-only, contagens no relatório, detalhe sensível só em `scratchpad/f19/`.
- [ ] Toda divergência confirmada: corrigida (com commit) ou pendência justificada com proposta.
- [ ] `lint`+`test`+`build` verdes; contagem de testes ≥ baseline do gate; CI verde incluindo o job `banco`.
- [ ] DECISOES/CHANGELOG/README/prompts-README/RELATORIO-F19 atualizados; nenhum dado real em docs/testes/matriz.

# Idioma

Narrativa, matriz, decisões, relatório e UI em pt-BR; identificadores de domínio em português sem acento e utilitários em inglês (convenção do repo); commits em pt-BR, estilo conventional.
