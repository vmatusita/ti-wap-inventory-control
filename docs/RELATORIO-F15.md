# RELATÓRIO F15 — service tag obrigatória (C1) · painel de sucesso da devolução (C2) · tipo `troca` (C3)

**Data:** 2026-07-23 · **Modo:** autônomo (CLAUDE.md) · **Base:** `dc62c67` (fim da F14) → `c11fb66`.

Três defeitos/ajustes que o Johnny relatou ao exercitar **de verdade, pela primeira vez**, o fluxo de devolução ao fornecedor entregue na F14 — exatamente o cenário que o `RELATORIO-F14.md` §5 avisou que nenhum E2E autenticado havia provado. Evidências abaixo, não afirmações.

## 1. O que mudou (e por quê)

### C1 — service tag obrigatória no cadastro manual (+ pendência no import)
- **Banco:** `service_tag` segue **nullable** (o import exige aceitar vazio). Migration **`0048`** recria `importar_ativos_substituir` (a partir da vigente `0040`, diff mínimo): service tag vazia → pendência **`'sem service tag'`** (`;`-joinável com `'sem patrimônio físico'` via `concat_ws`). **Sem check no banco** — decisão registrada (um `NOT VALID` em `ativos` re-avalia no UPDATE e quebraria toda movimentação de legado/seed; prova empírica em DEV).
- **Zod + Server Action (a régua):** `compraItemSchema` e `substitutoSchema` passam a exigir a tag; `parsearLista` recusa a linha sem tag (erro por linha) e `parearFaixaComServiceTags` exige o pareamento completo (vazio = erro). Forms: labels/mensagens do `nova-compra-form` (lista + faixa) e do substituto (`*` + pré-validação `faltando`).
- **Resolução (a pendência não é beco):** ficha ganha **"Definir service tag"** (`definir-service-tag-dialog.tsx` + action `definirServiceTag`), espelho do corrigir-patrimônio — só quando a tag está vazia; remove só o trecho `'sem service tag'`; ST preenchida continua imutável.
- **Preview do import:** aviso âmbar (tier F7F) com `resumo.semServiceTag` — informa, não trava.
- **Não retroage:** legados sem ST não ganham a pendência (só cadastros/imports daqui em diante).

### C2 — painel de sucesso da devolução engolido pelo guard (defeito)
Causa raiz confirmada: `devolucao-fornecedor-form.tsx` fazia `setSucesso(...)` e em seguida `router.refresh()`; o refresh re-renderizava o Server Component da página com o mesmo `?ativo=`, cujo guard `status !== 'em_manutencao'` virava verdadeiro (o ativo acabara de virar `devolvido_fornecedor`) e **substituía a página inteira — form e painel — pelo aviso âmbar**. Fix: **remover o `router.refresh()`** (e o `useRouter` morto). Os `revalidatePath` da action cobrem `/ativos`, as duas fichas e `/relatorios` — nenhum revalida a rota da devolução, então o painel (estado do cliente) permanece. O guard continua valendo para acesso direto / F5 (aceitável). O caso sem substituto persiste igual.

### C3 — substituto entra como `troca`, nunca "Compra"
Par de migrations espelhando 0044/0045: **`0046`** (`add value 'troca'`) e **`0047`** (usos). `troca` espelha `compra` na máquina de estados (nascimento `em_estoque`→`em_estoque`, fixa a filial) e como **entrada do período**; difere no rótulo ("Troca"), cor (teal AA claro/escuro) e em qualquer leitura "de compras" (nenhum KPI a inclui). Gravada só pela RPC `devolver_ao_fornecedor` — fora do fluxo manual, dos kits e do "duplicar" (como `compra`/`devolucao_fornecedor`). Entradas do relatório passam a listar `['devolucao','compra','troca']`. **Retroativo** (produção): as 2 movimentações de nascimento de substitutos já registrados viraram `troca`.

Tabela ponto × decisão completa em `scratchpad/f15/impacto.md` (varredura §0, 4 subagentes + leitura direta dos anchors).

## 2. Decisões (ata em `docs/DECISOES.md`, 2026-07-23 · F15)
Inclui a **revogação da decisão F14** "a compra do substituto aparece nas Entradas" (agora é a **troca** que entra), o C1-sem-check-no-banco (com a prova empírica), a separação da migration do import (`0048`), o `db:types` por edição cirúrgica do enum, a pendência no bucket "outras", e a causa-raiz do C2.

## 3. Saídas reais

### Qualidade (gate da união)
```
lint:  0 problems (eslint limpo)
test:  Test Files 46 passed (46) · Tests 947 passed (947)   [F14 fechou com 929]
build: next build — compilado, 0 erros de tipo
```
Novos testes somam sobre os 929: validadores de compra/substituto/definir-service-tag, pareamento da faixa (mandatória), `tiposManuaisPara` (trava a exclusão de `troca` do select manual), `EFEITO_MOVIMENTACAO`/ajuda (15 tipos), e o motor do import (`semServiceTag`).

### Roteiro SQL (`supabase/tests/troca.sql`) — DEV/ensaio
Executado em DEV numa transação com rollback: **`ROTEIRO_TROCA_RESULT: TODOS OS CENARIOS OK`**. Cobre: a RPC grava o substituto como `troca` (não `compra`); `troca` só no nascimento (de `em_uso` → exceção); estorno de `troca` restaura o snapshot; import com/sem service tag e com/sem patrimônio → pendências corretas. (No CI, o job `banco` roda o mesmo roteiro no Postgres real — disparado no push.)

### Rollout em produção (`pbtjcalbmepmrqzprusb`)
**Smoke baseline (pré-apply, read-only):** 1596 ativos; enum `tipo_movimentacao` com 14 valores (sem `troca`); 2 substitutos; 2 movimentações `compra` de substituto (tamanho do retroativo); 2 `devolvido_fornecedor`; cada função com 1 assinatura.

**Apply `0046` → `0047` → `0048` (MCP).** Verificação pós-apply:
- enum com 15 valores incluindo `troca` (no fim);
- `status_apos_movimentacao`/`aplicar_movimentacao`/`rel_estoque_asof`/`devolver_ao_fornecedor`/`importar_ativos_substituir`: **1 assinatura cada**;
- casos novos presentes (`pg_get_functiondef`): `troca` na máquina de estados, `in ('compra','troca')` no trigger e no as-of, `'troca'` no insert do substituto, `'sem service tag'` no import;
- grants: `devolver_ao_fornecedor` e `importar_ativos_substituir` = `authenticated` true, `anon`/`service_role` false; `rel_estoque_asof` = grants idênticos à 0045 (F15 não os tocou);
- `get_advisors(security)`: **0 achados NOVOS** (só os pré-existentes — RLS do modelo de nível único e o `importar_ativos_substituir` SECURITY DEFINER, de antes da F15);
- `notify pgrst, 'reload schema'`.

**Retroativo C3 (caminho B).** Backup das 2 linhas salvo (`scratchpad/f15/retroativo-backup.md`: WAP0005656, WAP0005657 — ambas nascimento `em_estoque`→`em_estoque`). UPDATE aplicado (o classificador NÃO barrou o UPDATE de 2 linhas). Contagem antes = depois: `compra` de substituto **2 → 0**, `troca` de substituto **0 → 2**; `troca` total = 2 (nenhuma troca perdida); os 2 substitutos seguem `em_estoque` com `status_resultante` intacto (a transição de `troca` é a mesma da `compra`).

**Deploy:** commit `c11fb66` → deploy `dpl_8wxLXV4sqYaBtvHHRNeFuF1DsFTy` **READY** (aliased a `ti-wap-inventory-control.vercel.app`). SQL aplicado ANTES do deploy; o retroativo e o push na mesma sessão (janela do enum minimizada). Rollback candidato: `dc62c67` (deploy anterior, `isRollbackCandidate`), promovível no painel Vercel se preciso — sem `git revert` destrutivo.

**Smoke pós-deploy (read-only):**
- DB: 1596 ativos (= baseline, sem perda); enum com `troca`; `troca` total = 2; `compra` de substituto restante = **0** (retroativo completo); `devolvido_fornecedor` = 2; ativos com pendência `'sem service tag'` em produção = 0 (esperado — nenhum import com ST vazia rodou em produção ainda; não retroage).
- Runtime: `get_runtime_errors` (última 1h, cobrindo o novo deploy) = **0 erros**.
- HTTP: `/login` → 200, `/relatorios/acesso` → 200 (rotas públicas servem; sem 500 na borda).

Exit do smoke pós-deploy: **0** (sem incidente).

## 4. Revisão adversarial (§R — 5 lentes, refutação por padrão, contexto fresco)
- **máquina de estados** — 1 achado: `troca` entrou em `TRANSICOES.em_estoque` mas o filtro do formulário manual (`tiposDoLote`) não a excluía → vazava como opção selecionável e quebrava no submit. **Confirmado por 2 lentes independentes** (a lente relatório/inventário achou o mesmo).
- **navegação C2** — limpo (refutou até a hipótese de os `revalidatePath` re-renderizarem a rota atual — a doc do Next.js 16 confirma que só re-renderiza a rota em exibição).
- **portas C1** — limpo (todas as portas manuais exigem a tag; o import não ficou mais duro).
- **relatório/inventário** — só o achado do `tiposDoLote` (as-of, série e KPIs íntegros).
- **retroativo/seed** — limpo.

**Emendas:** (1) régua centralizada em `TIPOS_FORA_DO_LOTE_MANUAL`/`tiposManuaisPara` (validators, testável) — `compra`/`troca`/`devolucao_fornecedor` nunca vazam para o select, com teste que trava; (2) achado próprio (fora das lentes): faltava o aviso âmbar do preview do import com a contagem de linhas sem service tag — implementado (`resumo.semServiceTag` + tile âmbar), com teste. **Re-revisão** (contexto fresco): **AMBAS AS EMENDAS LIMPAS**.

## 5. Pendências / backlog
- **Inconsistência pré-existente da F14 (fora do escopo):** `devolucao_fornecedor` não está nas exclusões `.neq` de `ultimaMovimentacaoDoUsuario`/`ultimosAtivosMovimentadosDoOperador` (a F15 acrescentou `troca`, espelho de `compra`, mas não corrigiu o legado da F14). Anotado para uma ordem futura.
- Editar service tag já preenchida continua proibido (imutável) — mantido como está.

## 6. O que este relatório NÃO prova
- **Sem E2E autenticado em navegador.** As telas ficam atrás do login e o agente não insere credenciais (limite desde a F11/F12). A prova do motor é o roteiro SQL (DEV) + Vitest (947); a do banco em produção é a verificação pós-apply + o retroativo conferido + smoke read-only. O que o Johnny confere no próximo caso real:
  1. **C1:** cadastrar equipamento novo (single/lista/faixa) ou substituto **sem service tag** é barrado no form com mensagem pt-BR; um import com service tag vazia mostra o aviso âmbar e nasce com a pendência `'sem service tag'` (visível em `/pendencias`), resolvível por "Definir service tag" na ficha.
  2. **C2:** ao registrar a devolução **com substituto**, o painel de sucesso com os dois cartões e links **permanece na tela** (nenhum aviso âmbar); as fichas mostram o antigo `devolvido_fornecedor` e o novo `em_estoque` com o vínculo nos dois sentidos.
  3. **C3:** o substituto aparece nas **Entradas** do relatório rotulado **"Troca"** (pílula teal), na linha do tempo e em `/movimentacoes`; nenhuma contagem "de compras" o inclui. Os 2 substitutos já existentes (WAP0005656/WAP0005657) já aparecem como "Troca" (retroativo aplicado).
- **CI (job `banco`):** disparado no push; o status do run confere no GitHub Actions. Os componentes foram provados em DEV.
- **O aviso âmbar do import** foi provado no motor (Vitest), não em navegador autenticado.
