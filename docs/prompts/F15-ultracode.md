ultracode

# OS-F15 (ultracode) — Correções do primeiro uso real da F14: service tag obrigatória no cadastro (C1) · painel de sucesso da devolução engolido pelo guard (C2) · substituto entra como "Troca", não "Compra" (C3)

Ordem **executável e autocontida**. Três defeitos/ajustes relatados pelo Johnny (23/07/2026) ao exercitar pela primeira vez, de verdade, o fluxo de devolução ao fornecedor entregue na F14 — exatamente o cenário que o `RELATORIO-F14.md` §5 avisou que nenhum E2E autenticado havia provado. Objetivo em uma linha: o cadastro manual passa a **exigir service tag** (import continua aceitando vazio, virando **pendência** como o patrimônio da F7E), o **painel de sucesso** da devolução ao fornecedor passa a **permanecer na tela** mostrando os dois ativos, e a entrada do substituto passa a ser a movimentação nova **`troca`** — nunca mais "Compra" — inclusive **retroativamente** nas já registradas. Tudo verificado por teste (Vitest + roteiro SQL + E2E em DEV), aplicado em produção pelo runbook e relatado com evidências.

**Modo autônomo com acesso total (CLAUDE.md).** Você roda de forma autônoma: **ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) convenções do repositório/CLAUDE.md/spec; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md` (data · contexto · escolha · motivo). Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se for seguro; senão siga com o resto e registre a pendência no relatório.

**Produção, de verdade — migrations E um retoque em dado.** ~1.600 ativos reais, 5 filiais. Trabalho **direto na `main`** (precedente F12 §2.2/F13/F14) — e como **push = deploy automático (Vercel)**: commits locais pequenos e frequentes, **`git push` SOMENTE no marco verde da §1.4**. As migrations desta ordem são **aditivas** (valor novo de enum, funções recriadas por `create or replace` puro — caminho **A** do `docs/RUNBOOK-BANCO.md`: MCP Supabase, ensaio primeiro, verificação pós-apply, `notify pgrst, 'reload schema'`, SQL **antes** do deploy). O único passo que **toca dado** é o retroativo do C3 (UPDATE de pouquíssimas linhas de `movimentacoes` — contagem esperada ≥1): trate-o pelo caminho **B** — backup das linhas afetadas ANTES, contagem antes/depois, e se o classificador barrar o UPDATE em produção (precedente 0034/F7E), **não insista**: deixe o SQL pronto no relatório com a instrução de 2 minutos para o Johnny. Nada destrutivo, nunca: sem `drop` de dado, sem `delete` em massa, sem force push, sem `git reset --hard`, sem `git clean`.

**Dados e segredos.** Nenhum dado real (nome, patrimônio, e-mail) em código, teste, seed, screenshot ou relatório — exemplos sempre fictícios (`WAP0001234` / "Fulano"). E2E e screenshots **somente contra DEV** (seed fictício); em produção, só leitura (smoke por contagens/status, padrão F12), os applies e o UPDATE retroativo da §1.4. Classifique o `.env.local` antes de qualquer script (`scripts/env-guard.ts`, precedente F11).

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. O orquestrador segue a §1; §W descreve as frentes.

---

## §0 — O que muda (contrato fixado — não re-decida os nomes)

Decisões tomadas **pelo Johnny nesta ordem** (23/07/2026) — não são sugestões:

| Peça | Nome | Observação |
|---|---|---|
| Tipo de movimentação novo | `troca` · rótulo **"Troca"** | entrada do substituto (nascimento, espelho da `compra` na máquina de estados); gravado **só pela RPC** — nunca é opção no fluxo manual nem em kits |
| Pendência nova (trecho `;`-joinável) | `'sem service tag'` | FONTE ÚNICA em `src/lib/dominio.ts` (constante irmã de `PENDENCIA_SEM_PATRIMONIO`); o literal hard-codado na RPC do import fica em SINCRONIA (mesmo precedente da 0034) |
| Obrigatoriedade | service tag **obrigatória em TODAS as categorias** nos cadastros manuais (novo equipamento e substituto) | **só dentro do sistema**; o import segue aceitando vazio → pendência (regra do Johnny: "igual o patrimônio") |
| RPC alterada | `devolver_ao_fornecedor` | a movimentação do substituto passa de `'compra'` para `'troca'` |
| RPC alterada | `importar_ativos_substituir` | service tag vazia importa e o ativo nasce com a pendência `'sem service tag'` |
| Cor da pill/badge de `troca` | teal (espelho da paleta existente), AA claro/escuro | distinta do verde da `compra` (precedente de contraste F7F) |

### C1 — Service tag obrigatória no cadastro manual (+ pendência no import)

Hoje `service_tag` é `opcional` nos dois validadores de cadastro (`compraItemSchema` em `src/lib/validators/compra.ts`; `substitutoSchema` em `src/lib/validators/devolucao-fornecedor.ts`) e a UI rotula "(opcional)". Passa a **obrigatória (todas as categorias)** em TODAS as portas de cadastro manual:

- **Novo equipamento** (`nova-compra-form.tsx`, single/lote): a aba **lista** ("service tag opcional após vírgula…") passa a exigir uma ST por linha; a aba **faixa** ("Vazio = faixa sem service tag") passa a exigir o pareamento completo — `parearFaixaComServiceTags` (`src/lib/patrimonio.ts`) e seus testes acompanham. Mensagens pt-BR apontando a linha/patrimônio que ficou sem ST.
- **Substituto** da devolução ao fornecedor: schema + a pré-validação amigável do form (a lista `faltando` em `devolucao-fornecedor-form.tsx` hoje nem cita service tag) + label com `*`.
- **Banco como segunda linha** (doutrina CLAUDE.md): avalie um `check NOT VALID` no padrão do MN1 da F14 — cuidado para NÃO quebrar import e legados (há ativos `origem='cadastro'` antigos sem ST; `NOT VALID` protege o histórico, mas o import insere com outra `origem` — confira a RPC vigente antes de escolher a expressão). Decida e registre; se o check ficar frágil, Zod+action bastam (registre o porquê).

**Import (espelho F7E do patrimônio):** service tag vazia **não bloqueia** — a linha importa e o ativo nasce com o trecho de pendência `'sem service tag'` (`;`-joinável com os existentes, ex.: `'sem patrimônio físico; sem service tag'`), aparecendo em `/pendencias` e na lista. Motor TS (`src/lib/import/plano.ts` e vizinhos) + RPC `importar_ativos_substituir` **recriada a partir da última definição VIGENTE** (confira qual migration a definiu por último — 0034→0036→0037→0040 mexeram nela; diff mínimo, precedente do diff-review §B.3 do runbook). No preview do import, um aviso **âmbar** (tier da F7F) com a contagem de linhas sem ST — informa, não trava. **Régua F7/F7B intacta** no resto (bloqueantes continuam bloqueando; "Substituir tudo" continua sendo o único modo).

**Caminho de resolução (a pendência não pode ser um beco):** a ficha ganha **"Definir service tag"** para ativo com ST **vazia** — espelho do corrigir-patrimônio da F6B (`corrigir-patrimonio-dialog.tsx` + action): valida colisão do par patrimônio+ST (§5, índice único `coalesce(service_tag,'')`), grava e remove **só** o trecho `'sem service tag'` da pendência, preservando os demais. **Editar uma ST já preenchida continua proibido** (imutável — identidade do equipamento, comentário B7 em `src/lib/validators/ativo.ts`); se durante a obra isso parecer insustentável, NÃO resolva aqui: registre no backlog do relatório.

**Não retroage:** ativos existentes sem ST **não** ganham a pendência nesta ordem (encheria `/pendencias` com o legado do go-live) — só cadastros e imports daqui em diante. Registre em DECISOES.

### C2 — Painel de sucesso da devolução engolido pelo guard (defeito)

Sintoma relatado: ao completar a devolução **com substituto**, em vez do painel de sucesso aparece o aviso âmbar:

> A devolução ao fornecedor só vale para um ativo em manutenção — este está "Devolvido ao fornecedor".

— e o Johnny não consegue ver os dois ativos com as mudanças. Causa raiz (confirme lendo): em `devolucao-fornecedor-form.tsx`, o sucesso faz `setSucesso(...)` e em seguida **`router.refresh()`**; o refresh re-renderiza o Server Component `app/(app)/movimentacoes/devolucao-fornecedor/page.tsx` com o MESMO `?ativo=`, o guard `ativo.status !== 'em_manutencao'` agora é verdadeiro (o ativo acabou de virar `devolvido_fornecedor`) e a página inteira — form e painel — é substituída pelo aviso. A RPC funcionou; é a **navegação pós-sucesso** que está errada.

Corrija a **causa raiz** (não suprima o guard): o painel de sucesso com os **dois cartões** (antigo devolvido + substituto em estoque, links para as fichas — ele já existe no form) precisa **permanecer na tela** após o registro. Escolha a mecânica mais simples e registre — ex.: dispensar o `router.refresh()` (as `revalidatePath` da action já cobrem `/ativos`, as duas fichas e `/relatorios`; confira se algo depende do refresh) ou levar o sucesso para um estado que sobreviva ao re-render do server. O guard **continua valendo** para acesso direto à página com ativo fora de manutenção (inclusive F5 depois do sucesso — comportamento aceitável; registre). O caso **sem substituto** persiste igualmente.

### C3 — Substituto entra como `troca`, nunca como "Compra"

Decisão do Johnny nesta ordem: equipamento que chega por substituição do fornecedor **não é compra** — nas Entradas do relatório, na linha do tempo e em `/movimentacoes` ele aparecia como "Compra" e isso mente sobre o que foi comprado. Entra o tipo **`troca`** (a decisão da F14 registrada em DECISOES — "a compra do substituto aparece nas Entradas" — é **revogada por esta ordem**; emende a ata, não a apague).

Par de migrations **espelhando 0044/0045** (valor novo de enum não é usável na transação que o adiciona; numeração real conferida no gate):

- **`0046_troca_enum.sql`** — só `alter type public.tipo_movimentacao add value if not exists 'troca';`
- **`0047_troca.sql`** — os usos, cada função recriada **a partir da última definição vigente** (diff mínimo, §B.3 do runbook):
  - `status_apos_movimentacao` (vigente: 0045): caso novo `when p_tipo = 'troca' and p_status in ('em_estoque') then 'em_estoque'` (nascimento, espelho da `compra`);
  - `aplicar_movimentacao` (vigente: 0045): a regra da filial `when new.tipo = 'compra' then new.filial_id` passa a `in ('compra','troca')` — nada mais muda;
  - `rel_estoque_asof` (vigente: 0045): o `coalesce` da filial `when u.tipo = 'compra' then u.filial_id` passa a incluir `troca`;
  - `devolver_ao_fornecedor`: o insert da movimentação do substituto troca `'compra'` → `'troca'` (comentários da função e da action acompanham);
  - a recriação da RPC do import (C1) pode viver aqui ou numa migration própria — decida e registre.
- **Retroativo (toca dado — caminho B):** as movimentações de nascimento dos substitutos JÁ registrados viram `troca`: `update movimentacoes set tipo='troca' where tipo='compra' and ativo_id in (select id from ativos where substitui_ativo_id is not null)`. Meça a contagem antes (esperada ≥1 — o caso real do Johnny), exporte backup das linhas, aplique, confira contagem e `status_resultante` intactos depois. Gate barrar → SQL pronto + instrução (§ Produção).

**Lado TS/UI — os Records exaustivos são seus aliados** (o build acusa o que faltar): `TIPO_META` ("Troca") e `pillTipo` (teal AA) em `dominio.ts`; `CAMPOS_POR_TIPO`/`TRANSICOES`/schemas em `validators/movimentacao.ts` espelhando a `compra` (e, como a compra, `troca` **fora** do fluxo manual de nova movimentação, fora dos kits — `TIPOS_EXCLUIDOS_DO_KIT` — e fora do "duplicar"); filtros de `/movimentacoes` e da lista; export CSV; ajuda (`conteudo.ts` + testes) explicando compra × troca; **Entradas do relatório**: `buscarLinhasPeriodo(..., ['devolucao','compra'])` em `src/lib/queries/relatorios/movimentacoes.ts` passa a incluir `'troca'` (é entrada real do período — só que rotulada "Troca"), `tabela-entradas.tsx` idem; a série de movimentações (só `saida`/`devolucao`) **não muda**; qualquer contagem/rótulo "de compras" (KPIs, resumo, dashboard) **não** inclui troca — é entrada, não compra.

### Varredura de impacto (a lista é sua, a régua é esta)

`troca` **espelha `compra`** na máquina de estados e como "entrada" do período; **difere** no rótulo, na cor e em qualquer leitura que signifique "o que foi comprado". `Grep "'compra'"` em `src/` e `supabase/migrations/` e decida ponto a ponto (as-of, views, KPIs, resumo do e-mail, export, import De→Para — o import **nunca** produz `troca` —, termos — compra não gera termo, troca idem —, seed). Estorno de `troca` funciona pelo mecanismo genérico de snapshot (roteiro cobre). Registre a tabela ponto × decisão em `scratchpad/f15/impacto.md` — insumo das frentes e do revisor.

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) Working tree **limpo na `main`** e sincronizado com `origin` (este arquivo de ordem não conta). Sujo → PARE e reporte. (b) Baseline verde **hoje**: `npm run lint && npm run test && npm run build` (a F14 fechou com 929 testes) — vermelho → PARE e reporte. (c) `.env.local` classificado (DEV × produção, `scripts/env-guard.ts`); MCP Supabase acessível (o rollout depende dele). (d) **Numeração real das migrations**: `ls supabase/migrations/` — última conhecida `0045`; esta ordem assume `0046`/`0047`, corrija se houver arquivo mais novo. (e) **Estado real do acervo**: contagem de `select count(*) from movimentacoes where tipo='compra' and ativo_id in (select id from ativos where substitui_ativo_id is not null)` em produção (read-only) — é o tamanho do retroativo C3; registre no relatório.

### 1.1 Forma de execução

Precedente registrado da F14: enum novo → `src/lib/types/database.ts` regenerado → quebras de TS **cruzadas** — por isso lá a execução foi num **único contexto**. Siga o mesmo padrão: **fases sequenciais na mesma árvore** (W1 → W2 → W3), commits pequenos por fase, push só no marco §1.4. Use subagentes para o que é naturalmente paralelo e read-only — a varredura §0, e a revisão adversarial da §R — não para editar arquivos em paralelo. Se durante a obra os recortes se mostrarem genuinamente disjuntos, pode paralelizar W2×W3 **em worktrees**; registre a escolha.

    ONDA 0 (orquestrador)        ONDA 1        ONDA 2                ONDA 3 (orquestrador)
    gate + varredura §0       →  W1 banco   →  W2 motor + forms  →   integração (lint+test+build)
    (scratchpad/f15/             (0046/0047,   W3 leituras/import/   → revisão adversarial §R → emendas
    impacto.md + contagem        roteiro SQL,  relatório/ajuda       → E2E DEV §1.5 → rollout §1.4
    do retroativo)               apply DEV,                          (SQL prod + retroativo → smoke →
                                 db:types)                           push único → smoke pós-deploy)
                                                                     → docs + RELATORIO-F15

### 1.2 Regras globais

1. **Escopo fechado em C1–C3 + varredura §0.** Nada de "aproveitar para fazer" (CLAUDE.md regra 1); o que surgir de fora vira backlog no relatório.
2. **Zero dependência nova** no `package.json` (byte a byte igual). Playwright via `npx` segue autorizado **só como ferramenta de verificação** (precedente F13) — fora de package.json/lockfile/CI.
3. **DEV primeiro:** migrations, seed (ganha 1 caso fictício de `troca` e 1 ativo importado com pendência `'sem service tag'`, para E2E e relatório renderizarem), E2E — tudo contra DEV. Produção só na §1.4.
4. Convenções CLAUDE.md: pt-BR em UI/erros/commits; escrita via Server Actions + Zod; leituras em `src/lib/queries/`; `src/components/ui/**` intocado; datas `dd/MM/yyyy`; `tabular-nums`; identificadores de domínio em pt sem acento.
5. **Verificação — rode de verdade:** `npm run lint && npm run test && npm run build` no fim de cada fase e na união; função pura nova → teste Vitest; roteiro SQL novo roda no Postgres do CI (job `banco`) e em DEV; causa raiz, nunca supressão — desabilitar/deletar/skipar teste para passar é proibido.
6. **Invariantes intocáveis:** régua do import F7/F7B/F7E/F7F fora o descrito no C1 (bloqueantes continuam bloqueando; ST vazia é AVISO+pendência, nunca erro); termos, kits, itens por quantidade e paleta não mudam de comportamento (kits apenas EXCLUEM `troca`); lote máx 30 nos demais tipos; migrations antigas nunca editadas; movimentações históricas continuam válidas; `devolucao_fornecedor`/`devolvido_fornecedor` (F14) não mudam de semântica.
7. Cada fase entrega: diff + checklist do próprio aceite autoverificado + rascunho para `docs/DECISOES.md` + pendências.
8. Commits pt-BR, estilo conventional: `fix(f15): painel de sucesso da devolução sobrevive ao refresh`, `feat(f15): tipo troca na entrada do substituto`.

### 1.3 Propriedade de arquivos (por fase)

| Fase | Arquivos |
|---|---|
| **W1** | `supabase/migrations/0046_*.sql` + `0047_*.sql` (+ a do import, se separada), `supabase/tests/**` (cenários novos no padrão `manutencao_fornecedor.sql`), apply em DEV via MCP, `npm run db:types`, `scripts/seed.ts` |
| **W2** | `src/lib/dominio.ts`, `src/lib/patrimonio.ts` (pareamento da faixa), `src/lib/validators/**`, `src/lib/actions/**`, `src/components/ativos/**` (nova-compra-form, dialog "Definir service tag"), `src/components/movimentacoes/**` (devolucao-fornecedor-form, C2), `src/app/(app)/movimentacoes/devolucao-fornecedor/**`, `src/app/(app)/ativos/novo/**` |
| **W3** | `src/lib/queries/**`, `src/lib/relatorios/**`, `src/lib/import/**`, `src/components/relatorios/**`, `src/components/admin/importar/**`, `src/app/(app)/ativos/[id]/**`, `/pendencias`, export, `src/lib/ajuda/**`, pontos restantes da varredura §0 |
| **Orquestrador** | `docs/**`, `README.md`, `CHANGELOG.md`, `scratchpad/**`, produção, push |

Fronteira W2×W3: `dominio.ts` é de W2 (W3 só consome); queries e ficha são de W3 (W2 só consome). Precisou cruzar → o orquestrador arbitra na integração.

### 1.4 Rollout (orquestrador — a parte sensível)

1. União verde (`lint`+`test`+`build`) + roteiros SQL ✓ em DEV + E2E DEV dos aceites §1.5.
2. **Smoke baseline** contra a produção atual (padrão F12 — contagens/status via MCP, read-only): registre a saída, incluindo a contagem do retroativo (gate e).
3. **Aplicar `0046` e depois `0047`** (+ a do import) em produção via MCP (caminho A — aditivas). Verificação pós-apply: enum contém `troca` (`select unnest(enum_range(null::public.tipo_movimentacao))`), cada RPC com **exatamente 1 assinatura** e grants certos (authenticated=true; anon/service_role=false), `status_apos_movimentacao`/`aplicar_movimentacao`/`rel_estoque_asof` com os casos novos (`pg_get_functiondef`). Depois: `notify pgrst, 'reload schema';`.
4. **Retroativo C3** (caminho B): backup das linhas afetadas (select completo salvo no relatório/scratchpad), UPDATE, contagem antes = depois, `status_resultante`/snapshots intactos. Classificador barrar → SQL pronto + instrução de 2 minutos para o Johnny; siga o resto.
5. **Push único na `main`** → aguardar deploy READY na Vercel. (SQL antes do deploy; o código velho ignora o valor novo do enum até o deploy — janela segura, mas minimize-a: retroativo e push na mesma sessão de trabalho.)
6. **Smoke pós-deploy**: exit ≠ 0 → incidente — corrija e repita; se grave, promova o deploy anterior no painel Vercel (não é git revert destrutivo) e registre.
7. Docs: `docs/RELATORIO-F15.md` (novo), `docs/DECISOES.md` (2026-07-23 · F15 — inclui a revogação da decisão F14 sobre a compra do substituto), `docs/ESPECIFICACAO.md` (§4 máquina/vocabulário com `troca`, §5 service tag obrigatória no cadastro manual, §7 Entradas, §10.2 pendência do import — emendas marcadas, precedente F7), `CHANGELOG.md`, `README.md`, `docs/prompts/README.md` (linha F15), `docs/RUNBOOK-BANCO.md` (ledger: migrations novas + o UPDATE retroativo registrado). Resumo final ~10 linhas em pt-BR apontando o relatório.

### 1.5 Aceites — o "pronto" de cada correção (verificados em DEV; produção via smoke/SQL de conferência)

- **C1:** cadastrar equipamento novo (single, lote colado e faixa) ou substituto **sem service tag** é barrado no form (mensagem pt-BR apontando o item) e no Zod/action — teste Vitest dos dois validadores e do pareamento da faixa; **todas as categorias**. Import com ST vazia **importa** e o ativo nasce com o trecho `'sem service tag'` (`;`-joinável), listado em `/pendencias`; aviso âmbar com contagem no preview. "Definir service tag" na ficha (só quando vazia) valida colisão do par §5, grava e remove **só** esse trecho. Ativos legados sem ST seguem sem pendência retroativa. Editar ST preenchida continua impossível.
- **C2:** registrar devolução **com substituto** em DEV → painel de sucesso com os **dois cartões e links** permanece na tela (nenhum aviso âmbar); as fichas mostram antigo `devolvido_fornecedor` e novo `em_estoque` com vínculo nos dois sentidos. Sem substituto → painel "sem substituto" persiste. Acesso direto à página com ativo fora de manutenção → aviso âmbar continua (guard intacto).
- **C3:** roteiro SQL ✓: a RPC grava `troca` no substituto; `troca` fora do nascimento → exceção; estorno da `troca` restaura; linha do tempo, `/movimentacoes`, filtros e export mostram "Troca" (pill teal); **Entradas** do relatório listam a troca rotulada "Troca" e nenhuma contagem "de compras" a inclui; retroativo aplicado com backup (contagem conferida); `troca` **não** aparece no fluxo manual, em kits nem no duplicar.
- **Qualidade:** `npm run lint && npm run test && npm run build` verdes (novos testes somam sobre os 929); job `banco` do CI verde; smoke baseline e pós-deploy OK; docs da §1.4.7 atualizados; `RELATORIO-F15.md` com saídas reais coladas.

---

## §W — Prompts das fases

**Comum a todas:** "Você é a fase **Wn** da OS-F15. Contrato de nomes na §0 — não re-decida. Regras §1.2; arquivos da sua linha na §1.3. Antes de escrever, leia os arquivos-âncora citados no seu recorte e siga o padrão do repositório (não o genérico). `npm run lint && npm run test && npm run build` no fim do recorte. Entregue: diff, checklist do aceite §1.5 autoverificado, rascunho para DECISOES, pendências."

- **W1 (banco):** `0046` = só o `add value` (espelho da 0044 — valor de enum não é usável na transação que o adiciona). `0047` = usos com **diff mínimo sobre a definição vigente de cada função** (0045 recriou as três — confira; qualquer outra diferença é bug), a RPC `devolver_ao_fornecedor` gravando `troca`, e a recriação da RPC do import com a pendência `'sem service tag'` (partindo da última vigente — confira 0034→0040). Cenários novos no roteiro SQL (padrão ✓/✗ com rollback): troca só no nascimento; estorno da troca; import com ST vazia → pendência; import com ST → sem pendência. Apply em DEV, roteiros lá, `npm run db:types`, seed (§1.2.3).
- **W2 (motor + forms):** `dominio.ts` (TIPO_META/pill de `troca`; constante `PENDENCIA_SEM_SERVICE_TAG`), validadores (`compra.ts`, `devolucao-fornecedor.ts`, matriz/TRANSICOES de `movimentacao.ts` espelhando a compra), `parearFaixaComServiceTags` exigindo pareamento completo, `nova-compra-form.tsx` (labels, mensagens, aba lista e faixa), C2 no `devolucao-fornecedor-form.tsx`/`page.tsx` (painel persiste; guard intacto), dialog + action "Definir service tag" (espelho corrigir-patrimonio). Toda função pura nova com teste.
- **W3 (leituras + import + relatório + varredura):** Entradas com `troca` (`queries/relatorios/movimentacoes.ts`, `tabela-entradas.tsx`), motor TS do import (`lib/import/**`: plano/preview com aviso âmbar e pendência), `/pendencias` e views exibindo o trecho novo, ficha (pendência + entrada "Troca" na linha do tempo), export, ajuda (`conteudo.ts` + testes: compra × troca; service tag obrigatória; pendência nova), varredura `impacto.md` aplicada.

## §R — Onda 3: revisão adversarial + fechamento (orquestrador)

1. Subagente revisor em **contexto fresco, com refutação por padrão** (precedente F9–F14): revisa o diff inteiro contra os aceites §1.5, as invariantes §1.2.6 e a `impacto.md` — "aponte lacunas de correção, regressão ou requisito descumprido; não estilo; para cada achado, tente refutá-lo antes de reportar". Lentes obrigatórias: **máquina de estados** (SQL×TS em sincronia; `troca` inalcançável fora do nascimento); **navegação do C2** (o painel sobrevive? em que re-render ele morre? sem substituto também?); **portas do C1** (alguma porta de cadastro manual escapou da obrigatoriedade? o import ficou mais duro do que o combinado?); **relatório/inventário** (troca contada como entrada mas nunca como compra; as-of íntegro); **retroativo** (só as linhas certas mudaram; snapshots intactos). Emendas → re-revisão até limpar.
2. E2E DEV final dos aceites + suíte na união → rollout §1.4 completo.
3. `docs/RELATORIO-F15.md`: o que mudou (arquivos e porquês), decisões (aponte DECISOES.md — inclusive a revogação da decisão F14), saídas **reais** de lint/test/build, dos roteiros SQL, do retroativo (contagens antes/depois) e dos smokes, a `impacto.md` final, pendências, e a seção **"o que este relatório NÃO prova"** (precedente F12–F14 — ex.: sem E2E autenticado em produção; diga exatamente o que o Johnny confere no próximo caso real: cadastro barrado sem ST, painel persistindo, "Troca" nas Entradas). Evidências, não afirmações.

## Idioma

Narrativa, relatório, commits e UI em pt-BR. Identificadores de domínio em português sem acento (`troca`, `sem service tag`), utilitários/infra em inglês (padrão do repositório).
