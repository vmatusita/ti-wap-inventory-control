ultracode

# OS-F12 (ultracode) — F5 na prática: kits de movimentação salvos (M12) · estoque mínimo por item (I5) · auditoria + smoke logado dos commits recentes em produção

Ordem **executável e autocontida**. Executa dois itens prometidos da F5 (`docs/prompts/F5-refino.md` §5.9 e o "estoque mínimo por item" da spec) + uma dívida de processo: **os últimos commits entraram em produção sem smoke test e sem ninguém logar no sistema para conferir** — esta OS audita esses commits e instala um **smoke logado reexecutável** contra a produção. Objetivo em uma linha: kits salvos aplicáveis no fluxo, ponto de reposição visível em `/itens` e no dashboard, e produção conferida de ponta a ponta com login de teste.

**Modo autônomo com acesso total (CLAUDE.md).** Você roda **de forma autônoma: ninguém vai responder perguntas — não pare para perguntar nem espere confirmação em nenhuma hipótese.** Régua de decisão: (1) esta ordem; (2) convenções do repositório/CLAUDE.md; (3) a opção mais simples e reversível — registrada em `docs/DECISOES.md`. Mesma falha após ~3 tentativas → mude de abordagem e registre. Bloqueio real → contorne se seguro; senão siga com o resto e registre a pendência no relatório.

**Produção, de verdade.** Sistema em produção com dados reais (~1.600 ativos, 5 filiais). Por decisão do Johnny (§2), esta OS trabalha **direto na `main`** — e como **push = deploy automático (Vercel)**, a regra de ouro é: **commits locais frequentes, `git push` SOMENTE nos marcos verdes definidos em §1.4**. As duas migrations desta OS são **puramente aditivas** e são aplicadas em produção pelo orquestrador, com backup antes (§1.4). Nada destrutivo, nunca: sem `drop`, sem `delete` em massa, sem force push, sem `git reset --hard`, sem `git clean`.

**Segredos:** as credenciais do smoke chegam **exclusivamente por variáveis de ambiente** (§1.5). Elas **não existem** neste arquivo, não podem ser escritas em nenhum arquivo do repositório, em commit, em log ou no relatório (a senha aparece como `***` em qualquer saída). Se as variáveis não estiverem presentes, o smoke logado degrada para o smoke sem sessão + pendência registrada — **não trave**.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O `CLAUDE.md` é lido sozinho e manda sempre. O orquestrador segue a §1; os blocos §W1–§W6 são os prompts completos dos subagentes. A autoridade das decisões está na **§2 (Johnny, 22/07/2026)**.

---

## §0 — O que estamos construindo (âncoras por símbolo — a base é pós-F11, localize por Grep, nunca por número de linha)

| Item | O quê | Fonte de autoridade / onde olhar |
|---|---|---|
| **M12** | Kits de movimentação salvos: modelo nomeado ("Kit novo colaborador") com a config do lote (tipo, motivo, termo, observação, categorias esperadas), gestão em admin e aplicação na tela de nova movimentação | `F5-refino.md` §5.9 (tabela `kits_modelos (id, nome, payload jsonb, criado_por)`; aceite: registrar um kit de 3 itens em <60s); spec §6.4 ("kits ficam na F5"); o fluxo atual: `nova-movimentacao-form.tsx` (`repetirUltima`/`?duplicar` — o padrão de pré-preenchimento a estender) |
| **I5** | Estoque mínimo por item (ponto de reposição): campo no catálogo, badge "repor" nos saldos, card no dashboard | spec (estoque mínimo é item futuro da F5); a F9 **removeu** da ajuda a menção aspiracional — agora o recurso passa a existir e a ajuda volta a citá-lo, correto; catálogo hoje: `validators/item.ts` (nome/grupo/ordem/ativo), `admin/item-dialog.tsx` |
| **Auditoria** | Os commits desde a última OS concluída com smoke registrado entraram **sem** smoke e **sem** acesso logado — revisar cada um e cobrir suas áreas no roteiro | `git log` + `CHANGELOG.md`/`docs/DECISOES.md` (a última entrada com smoke documentado define o marco zero da auditoria) |
| **Smoke logado** | Script reexecutável que loga na produção com a conta de teste (via env) e confere leituras reais + páginas; roda ANTES do rollout (baseline dos commits suspeitos) e DEPOIS do deploy (valida a F12) | `scratchpad/smoke/` (novo); stack existente: `@supabase/supabase-js` já é dependência — **zero dependência nova** |

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada

(a) **F9, F10 e F11 concluídas** (linhas no `README.md`) e working tree **limpo na `main`** (que é onde esta OS trabalha — decisão §2). (b) Baseline verde **hoje**: `npm run lint && npm run test && npm run build` — suíte vermelha antes de começar → **PARE e reporte**. (c) `supabase/migrations/` termina em `0040_hardening_rpcs.sql` (F9–F11 não criam migration) — **0041 e 0042 livres; confira antes de numerar**. (d) `docs/RUNBOOK-BANCO.md` existe (é o manual de aplicação de migrations do projeto — leia-o na fase 0). (e) Variáveis de ambiente do smoke (§1.5) presentes — ausentes **não** trava o gate: o smoke degrada e a pendência é registrada. Falhou (a)–(d) → **PARE e reporte**.

### 1.1 Grafo de execução

```
FASE 0 (orquestrador)     ONDA 1 (frentes ∥ · arquivos disjuntos)          ONDA 2 (∥)               ONDA 3                FINAL (orquestrador — §1.4)
gate §1.0 · runbook ·     W1 banco+motor em DEV (0041 estoque_minimo ·     W2 UI estoque mínimo     W6 revisão            smoke BASELINE em produção →
baseline verde ·          0042 kits_modelos · tipos · queries/actions/  →  W3 UI kits (admin +   →  adversarial +     →   backup → migrations em prod →
contrato §1.5             validators — nada de UI)                         aplicar no fluxo)        emendas + E2E DEV     push único (deploy) → smoke
                          W4 auditoria dos commits (análise, read-only)                             + RELATORIO-F12       LOGADO pós-deploy → relatório
                          W5 smoke script (scratchpad, fora do app)
```

- **Isolamento (precedente F6A→F11):** subagentes paralelos na **mesma árvore**, direto na `main` local (decisão §2 — sem branch), commits pequenos por frente, **push proibido aos subagentes** (só o orquestrador, nos marcos §1.4). Propriedade de arquivos disjunta (§1.3).
- **W2/W3 partem do contrato §1.5** (shapes do W1) e rodam na onda 2, sobre o W1 integrado. **W4 e W5 rodam em paralelo na onda 1 e são independentes na construção** — a cobertura dirigida (mapa commit→área do W4 no smoke do W5) é **reconciliada na integração/W6**: o orquestrador confere que cada área tocada pelos commits tem ≥1 check no smoke; faltando, o W6 acrescenta. W5 não bloqueia esperando o W4.
- **Ninguém toca** `package.json`, `next.config.ts`, `src/components/ui/**`, `.env*`; nenhum subagente aplica migration em produção (só o orquestrador, §1.4).

### 1.2 Regras globais

1. **Subagentes desenvolvem e ensaiam contra o Supabase DEV** (projeto de ensaio); migrations rodam em DEV primeiro, com smoke SQL comentado. **Produção é só do orquestrador (§1.4).** Custo **R$ 0**.
2. **Migrations desta OS são estritamente aditivas** (uma coluna com default; uma tabela nova com RLS/grants no padrão das existentes). Se qualquer entrega "precisar" de algo destrutivo, é sinal de desenho errado: pare a frente e registre.
3. **Zero dependência nova.** `package.json` **byte a byte igual** (o smoke usa `@supabase/supabase-js` + `fetch`, ambos já disponíveis).
4. **Nenhum dado real e nenhum segredo** em código/teste/commit/log/relatório: exemplos `WAP0001234`/"Fulano"; credenciais só via env (§1.5); a senha é sempre mascarada; o smoke reporta **contagens e status codes, nunca conteúdo de linhas** (produção tem dados reais — eles não entram em arquivo nenhum).
5. Convenções CLAUDE.md: pt-BR na UI/erros/commits; escrita via Server Actions + Zod (schema espelhado client/servidor); leituras em `src/lib/queries/`; client só chama proxies de action; `dd/MM/yyyy`; `tabular-nums`; RLS + `security definer` com `set search_path` no padrão das migrations existentes.
6. **Verificação — rode de verdade:** `npm run lint && npm run test && npm run build` no recorte e na união; causa raiz, nunca suprimir/deletar teste; funções puras novas com Vitest (regra "repor", payload do kit, checklist de categorias).
7. Cada subagente entrega: código + checklist autoverificado + rascunho para `docs/DECISOES.md` + pendências.
8. **Invariantes intocáveis:** tudo da F9/F10/F11; máquina de estados no banco; lote máx 30 (F10); acesso nível único + viewer por senha (kits e estoque mínimo **não** aparecem no shell do visualizador além do que as views já expõem); import e salvaguardas; **nenhum texto do vocabulário §5 muda**.
9. Commits pt-BR estilo conventional por frente (`feat(f12): kits de movimentação salvos`); **nunca** force push / `reset --hard` / `clean` / amend de commit alheio; **push é exclusivo do orquestrador**.

### 1.3 Mapa de propriedade de arquivos (disjunto por construção)

| Dono | Arquivos |
|---|---|
| **W1** | `supabase/migrations/0041_estoque_minimo.sql` + `0042_kits_modelos.sql` (**novos**), `src/lib/types/database.ts` (regen/ajuste), `src/lib/validators/item.ts`, `src/lib/queries/itens.ts` (catálogo/admin passam a expor `estoque_minimo`), `src/lib/actions/itens.ts` (inputs de `criarItem`/`atualizarItem` ganham o campo), `src/lib/validators/kit.ts` + `src/lib/queries/kits.ts` + `src/lib/actions/kits.ts` (**novos**), testes dos validators |
| **W2** | `src/components/admin/item-dialog.tsx`, `src/app/(app)/admin/itens/page.tsx`, `src/app/(app)/itens/page.tsx` + `src/components/itens/**` (badge/coluna "repor"), `src/app/(app)/page.tsx` (card do dashboard) |
| **W3** | `src/app/(app)/admin/kits/page.tsx` (**novo**), `src/components/admin/kit-dialog.tsx` (**novo**), `src/components/admin/admin-nav.tsx` (item novo), `src/components/movimentacoes/nova/passo-movimentacao.tsx` (+ `nova-movimentacao-form.tsx`/`config.ts` **só se** o aplicar-kit exigir estado no form) |
| **W4** | **Read-only** (análise dos commits); achados viram lista para o W6 — não edita nada |
| **W5** | `scratchpad/smoke/smoke-prod.mjs` (**novo**; committável — não contém segredo nenhum, lê tudo de env) + `scratchpad/smoke/README.md` (**novo**, como rodar) |
| **W6** | Revisão (corrige qualquer arquivo) + `README.md`, `CHANGELOG.md`, `docs/prompts/README.md`, `docs/DECISOES.md`, `docs/BACKLOG-UX.md` (I5/M12 saem de "Já previstos"), `docs/prompts/F5-refino.md` (5.9 e estoque mínimo → concluídos aqui), `docs/ESPECIFICACAO.md` (§5 schema `itens`+`kits_modelos`; §6 aplicar-kit), `src/lib/ajuda/conteudo.ts` (+ teste), `docs/RELATORIO-F12.md` (**novo**) |

Conflito previsto: `ItemCatalogo`/`queries/itens.ts` é do W1 e o W2 consome — o shape está fixado no contrato §1.5. Fora isso, nenhum arquivo com dois donos.

### 1.4 Rollout em produção e marcos de push (orquestrador — a parte sensível)

1. **Fim da onda 2 + W6:** `npm run lint && npm run test && npm run build` verdes na união; E2E do W6 em DEV ok. **Nenhum push até aqui.**
2. **Smoke BASELINE em produção (pré-rollout):** rodar `scratchpad/smoke/smoke-prod.mjs` contra a produção **atual** (que contém os commits não verificados). Falhou algo → é exatamente o que o Johnny temia: **corrija a causa raiz agora** (as correções entram no mesmo rollout), registre no relatório o que estava quebrado em produção.
3. **Backup lógico** (pré-migration): export das tabelas afetadas (`itens` completo; contagens de `lancamentos_item`) para `scratchpad/backups/f12-<data>/` via leitura autenticada — arquivos **locais, fora do git** (`.gitignore` os cobre? confira; senão, não commite).
4. **Migrations em produção** (`0041`, `0042`) pelo mecanismo do `docs/RUNBOOK-BANCO.md`, uma a uma, com conferência entre elas (coluna existe com default 0; tabela existe vazia com RLS). **Aditivas = retrocompatíveis**: o app no ar ignora a coluna/tabela novas até o deploy.
5. **Push único na `main`** (= deploy Vercel) com tudo integrado → aguardar READY.
6. **Smoke LOGADO pós-deploy:** rodar o script de novo + roteiro §W5.3; exit code ≠ 0 → trate como incidente: corrija e repita (correção pequena) ou, se grave, reverta o deploy pelo painel Vercel (promover o deploy anterior — **não** é git revert destrutivo) e registre.
7. **Fallbacks sem drama:** push/migration barrados pelo ambiente (classificador) → não insista: deixe o SQL pronto em `supabase/migrations/`, o código commitado local, o relatório completo e a(s) linha(s) exata(s) pendente(s) no resumo (precedente da 0034: o Johnny aplica no SQL Editor em 2 minutos).
8. Resumo consolidado no fim (~10 linhas, pt-BR) apontando `docs/RELATORIO-F12.md`.

### 1.5 CONTRATO entre frentes (fixo — mudar = decisão registrada)

**Banco/tipos (W1 declara; W2/W3 consomem):**

```ts
// 0041: alter table itens add column estoque_minimo int not null default 0 check (estoque_minimo >= 0)
//   0 = sem alerta (comportamento atual). Regra "repor" (função pura, com teste):
//   repor = estoque_minimo > 0 && estoqueConsolidado < estoque_minimo   // consolidado, não por filial (§2)
ItemCatalogo += { estoque_minimo: number }        // listarItensAtivos expõe (badge de /itens; join por item_id)
ItemAdmin   += { estoque_minimo: number }        // listarItensAdmin expõe; o ItemEdit do item-dialog ganha o campo

// 0042: kits_modelos (F5 §5.9): id, nome, payload jsonb, ativo bool default true, criado_por uuid,
//   created_at — nome único case-insensitive via `create unique index kits_modelos_nome_uidx
//   on kits_modelos (lower(nome))` (mesmo mecanismo de itens_nome_uidx; SEM citext);
//   RLS/grants no padrão das tabelas existentes (authenticated tudo; anon nada)
export type KitPayload = {
  tipo: TipoMovimentacao                          // nunca 'compra' | 'estorno'
  motivo?: string; termo?: TermoStatus; observacao?: string
  categorias: CategoriaAtivo[]                    // enum categoria_ativo (dominio.ts); ordenar por CATEGORIA_ORDEM na UI
}
// actions/kits.ts: retorna ActionResult ({ ok } | { ok: false, erro }) de @/lib/actions/erros e exige operador
//   (idOperador/MSG_SESSAO_EXPIRADA de @/lib/auth/acesso) — padrão de TODAS as actions; erro de duplicado
//   detectado pelo nome do índice (kits_modelos_nome_uidx) → "Já existe um kit com esse nome."
// queries/kits.ts: listarKitsAtivos(), … · actions/kits.ts: criarKit/atualizarKit/desativarKit (+ proxy de leitura
//   para o fluxo client) · validators/kit.ts: payload validado com os enums reais de dominio.ts
```

**Variáveis de ambiente do smoke (W5 lê; ninguém as escreve em arquivo/commit/log):**
`SMOKE_URL_APP` (URL de produção do app) · `SMOKE_SUPABASE_URL` · `SMOKE_SUPABASE_ANON_KEY` · `SMOKE_EMAIL` · `SMOKE_SENHA`. A senha nunca é impressa (nem em erro — capture e mascare). Ausentes → o script roda só a parte sem sessão e sai com aviso; a parte logada vira pendência.

---

## §W1 — Subagente W1: banco + motor (DEV) — estoque mínimo e kits, sem UI

Você é um subagente executando a frente **W1** da OS-F12. Modo autônomo, **contra o Supabase DEV**. Seus arquivos: linha W1 do §1.3 — nada de UI. Leia antes: `docs/RUNBOOK-BANCO.md`, `supabase/migrations/0003_tabelas.sql` + `0005_rls.sql` + `0014_itens.sql` (padrões de tabela/RLS/grants), `validators/item.ts`, `queries/itens.ts` (`listarItensAtivos`, `ItemCatalogo`), `dominio.ts` (enums reais para o `KitPayload`), `actions/itens.ts` (o CRUD-exemplar a copiar — catálogo com nome único, caso idêntico ao kit), `actions/movimentacoes.ts` → `buscarAtivosParaMovimentacao` (padrão de proxy de leitura para client), `F5-refino.md` §5.9.

### Entregas

1. **`0041_estoque_minimo.sql`**: a coluna com default 0 + check, comentário SQL explicando a semântica (0 = sem alerta; comparação com o consolidado), smoke SQL comentado com rollback no fim (padrão das migrations do repo). Aplicar **em DEV** e conferir.
2. **`0042_kits_modelos.sql`**: tabela do contrato §1.5, nome único case-insensitive (padrão do catálogo de itens), RLS "authenticated tudo" no padrão de nível único das outras tabelas, grants espelhando `0014`; **sem seed** (kit de exemplo não entra em produção por migration). Aplicar em DEV e conferir.
3. **Tipos**: atualizar `src/lib/types/database.ts` pelo mecanismo que o projeto usa (regen ou edição manual coerente — veja como as ordens anteriores fizeram e siga).
4. **Motor do I5**: `itemCatalogoSchema`/`atualizarItemSchema` ganham `estoque_minimo` (int ≥ 0, default 0, mensagens pt-BR — espelhe o campo `ordem`); `listarItensAtivos` **e** `listarItensAdmin` passam a expor o campo (contrato §1.5); **`actions/itens.ts`**: os tipos de input de `criarItem`/`atualizarItem` ganham `estoque_minimo` **e** a lista explícita do `.update({ nome, grupo, ordem, ativo })` do `atualizarItem` inclui o campo — **sem isso o valor é descartado em silêncio ao editar**; função pura `precisaRepor(estoqueConsolidado, estoqueMinimo)` com teste.
5. **Motor do M12**: `validators/kit.ts` (payload validado contra os enums de `dominio.ts`; `tipo` nunca `compra`/`estorno`; categorias não-vazias), `queries/kits.ts`, `actions/kits.ts` (CRUD com re-validação, erros traduzidos no padrão `traduzErroBanco`, `revalidatePath`) + **proxy de leitura** para o fluxo (client) — padrão dos proxies existentes.

### O que NÃO fazer

Não tocar em UI, não mexer na RPC `rel_saldo_itens` (o consolidado a UI já tem — a comparação é em código), não aplicar nada em produção, não criar seed.

### Aceite W1

- [ ] Migrations aplicadas **em DEV** com smoke SQL ok; tipos atualizados; `0041`/`0042` numeradas certas (conferido contra a pasta)
- [ ] Contrato §1.5 exportado com as assinaturas exatas; `precisaRepor` e o validator do kit com testes verdes; suite antiga verde
- [ ] Zero UI, zero produção, zero seed; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W2 — Subagente W2 (ONDA 2): UI do estoque mínimo (I5)

Você é um subagente executando a frente **W2** da OS-F12, sobre o W1 integrado. Modo autônomo, DEV. Seus arquivos: linha W2 do §1.3. Leia antes: `admin/item-dialog.tsx` + `admin/itens/page.tsx` (CRUD atual), `itens/page.tsx` + `components/itens/**` **no estado pós-F11** (visões consolidado/por-filial do I4), `(app)/page.tsx` (dashboard pós-F9 — KPIs linkados), o contrato §1.5.

### Entregas

1. **Catálogo**: campo "Estoque mínimo" no `item-dialog` (numérico ≥ 0; hint "0 = sem alerta de reposição") + coluna "Mínimo" na tabela de `admin/itens`.
2. **Saldos (`/itens`)**: badge âmbar **"repor"** (padrão do badge "faltam N") quando `precisaRepor(consolidado, minimo)` — na visão consolidada, na linha; na visão por filial (F11), junto ao **Total** (decisão §2: o mínimo compara com o consolidado). Tooltip/`title` com "mínimo: N".
3. **Dashboard**: card "Itens para repor" — um `Card` **inline** em `(app)/page.tsx` (padrão dos cards Pendências/Últimas; **não** é tile do `KpiTiles`), contagem via `getSaldosItens(null)` × `estoque_minimo` (de `listarItensAtivos`) comparados com `precisaRepor` em código; 0 → não aparece ou aparece neutro; linka `/itens`.
4. Nada de e-mail/notificação (continua F5 §5.2/5.3 — fora).

### Aceite W2

- [ ] Em DEV: item com mínimo 5 e estoque 3 → badge "repor" nas duas visões e card no dashboard com contagem certa; mínimo 0 → nenhum alerta
- [ ] Editar mínimo pelo admin reflete sem F5 manual (`revalidatePath`); `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W3 — Subagente W3 (ONDA 2): kits — admin + aplicar no fluxo (M12)

Você é um subagente executando a frente **W3** da OS-F12, sobre o W1 integrado. Modo autônomo, DEV. Seus arquivos: linha W3 do §1.3. Leia antes: `admin/motivos/page.tsx` + `motivo-dialog.tsx` (o CRUD-padrão a copiar), `admin-nav.tsx`, `passo-movimentacao.tsx` + `nova-movimentacao-form.tsx` **no estado pós-F10/F11** (onde vivem "Repetir última", os campos condicionais por tipo e o toast de tipo incompatível), o contrato §1.5.

### Entregas

1. **Admin**: `/admin/kits` (page + `kit-dialog` no padrão dos CRUDs) — nome, tipo (**não** use o enum cru como o `motivo-dialog` faz: exclua `compra` e `estorno`, mesma exclusão do fluxo, rótulos por `rotuloTipo`), motivo (o `kit-dialog` recebe `motivos` de `listarMotivos()` carregado na page e **replica** o filtro `motivos.filter(m => m.aplica_a.includes(tipo))` — não existe helper compartilhado), termo, observação padrão, **categorias esperadas** (checklist multi-select das categorias do domínio), ativo/desativar (kit usado não se exclui — padrão do catálogo de itens). Item "Kits" no `admin-nav`.
2. **Aplicar no fluxo**: no passo 2 da nova movimentação, ao lado de "Repetir última", select/botão **"Aplicar kit"** (lista `listarKitsAtivos` via proxy): aplica a config do payload ao form (mesmo mecanismo do `repetirUltima` — sobrescreve com `toast` avisando) e mostra um **checklist âmbar não-bloqueante** comparando as categorias do kit com as do lote atual ("Kit novo colaborador espera: notebook ✓ · monitor ✗ · celular ✗ — adicione os que faltam ou registre assim mesmo"). Tipo do kit incompatível com o lote → mesmo tratamento do reset explicado (F9/M7): toast dizendo o porquê, sem aplicar.
3. **Aceite de velocidade da F5 §5.9**: documentar no seu checklist um ensaio real em DEV — do zero até "N movimentações registradas" usando um kit de 3 categorias em **menos de 60 segundos** (conte pelo relógio e registre o tempo).

### Aceite W3

- [ ] CRUD de kits completo em DEV (criar/editar/desativar; nome duplicado com erro traduzido); item no admin-nav
- [ ] "Aplicar kit" preenche o form, avisa sobrescrita, mostra o checklist de categorias e respeita a interseção de tipos (incompatível → toast, não aplica)
- [ ] Ensaio <60s registrado; kits **não** aparecem para visualizador por senha; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §W4 — Subagente W4 (ONDA 1): auditoria dos commits sem smoke — read-only

Você é um subagente executando a frente **W4** da OS-F12. **Você não edita nada** — seu entregável é análise para o W6 e para o roteiro do smoke. Modo autônomo.

1. **Delimite o conjunto**: identifique no `git log` (main) todos os commits **posteriores à última OS/entrada do CHANGELOG com smoke registrado** (leia `CHANGELOG.md` e as entradas recentes de `docs/DECISOES.md` para achar o marco; na dúvida, pegue o intervalo maior). Liste hash · data · mensagem · arquivos.
2. **Revise cada diff adversarialmente** (lacunas de correção ou de requisito — não estilo): regressões prováveis, rotas/telas afetadas, escrita vs leitura, uso de padrões da casa (Server Action + Zod? pt-BR? teto do lote? invariantes F9–F11?).
3. **Produza duas saídas**: (a) lista de achados com arquivo:símbolo + severidade (crítico/alto/médio/baixo) + correção proposta — vai para o W6 corrigir; (b) **mapa commit→área** para o W5 cobrir no roteiro do smoke (ex.: commit mexeu em `/itens` → o smoke precisa bater em `/itens` logado).
4. Rode a suíte inteira e anote qualquer teste que já falhe na base (não conserte — reporte; o gate §1.0 já deveria ter barrado).

### Aceite W4

- [ ] Todos os commits do intervalo listados e revisados; achados com severidade; mapa commit→área entregue (reconciliado na integração/W6); suíte rodada com resultado anotado; zero edição de arquivo

---

## §W5 — Subagente W5 (ONDA 1): o smoke logado reexecutável

Você é um subagente executando a frente **W5** da OS-F12. Modo autônomo. Seus arquivos: `scratchpad/smoke/smoke-prod.mjs` + `scratchpad/smoke/README.md` (novos). **O script não contém nenhum segredo** — lê tudo das envs do §1.5 e roda com `node scratchpad/smoke/smoke-prod.mjs`.

1. **Parte A — sem sessão (sempre roda):** `fetch` na `SMOKE_URL_APP`: `/login` responde 200; rotas de operador (`/`, `/ativos`, `/itens`, `/movimentacoes`, `/pendencias`) **redirecionam** para login quando sem sessão (3xx ou página de login — valide sem seguir dados); nenhuma resposta 5xx. Relatório: rota → status.
2. **Parte B — logado (roda se as envs existirem):** com `@supabase/supabase-js` (`createClient(SMOKE_SUPABASE_URL, SMOKE_SUPABASE_ANON_KEY)`), `signInWithPassword({ email: SMOKE_EMAIL, password: SMOKE_SENHA })` → com a sessão: leituras reais que o app faz — contagem de `ativos`, RPC **`rel_saldo_itens`** (consolidado — `{ p_filial: null, p_ate: <hoje ISO, fuso America/Sao_Paulo> }`; sem os params ela falha), view **`v_pendencias`** (mesma leitura do dashboard/`queries/pendencias-detalhe.ts`), 1 página da tabela `movimentacoes` — validando **status + shape + contagens > 0 onde fizer sentido**. Os checks de `kits_modelos` e `itens.estoque_minimo` **detectam ausência de tabela/coluna em runtime** (erro de schema do PostgREST) e se marcam **"n/a — pré-F12"** em vez de falhar — assim o MESMO script fica verde no baseline (§1.4.2, produção ainda sem as migrations) e esses checks só são exigidos no pós-deploy (§1.4.6). **Nunca** imprima conteúdo de linhas (dados reais) nem a senha (mascare até em stack trace); ao final, `signOut()`. Exit code 0 só se tudo passou; falha → exit 1 com resumo por check.
3. **Parte C — navegador (condicional):** se a sessão do Claude Code tiver ferramenta de navegador disponível (ex.: Claude in Chrome), roteiro visual: login com a conta de teste, abrir dashboard, `/ativos`, `/itens`, `/movimentacoes`, uma ficha; as screenshots contêm **dados reais** e são a única exceção local registrada à regra do CLAUDE.md: (1) **nunca** vão a commit/log/relatório/documentação; (2) adicione `scratchpad/smoke/*.png` (e subpastas de captura) ao `.gitignore` **antes** de capturar e confirme que não entram em `git add`; (3) servem só para a conferência visual imediata e devem ser **apagadas ao fim da conferência** — se retidas, registre em `docs/DECISOES.md` como exceção local com justificativa e prazo de expurgo. Sem ferramenta de navegador → registre "parte C não executada (sem navegador na sessão)" e siga.
4. **Cobertura dirigida:** incorpore o mapa commit→área do W4 — cada área tocada pelos commits não verificados precisa de pelo menos 1 check em A ou B.
5. `README.md` do smoke: como exportar as envs (sem valores!), como rodar, como interpretar a saída — para o Johnny reexecutar sozinho depois de qualquer deploy.

### Aceite W5

- [ ] Script roda em DEV (apontando envs de DEV) com exit 0; sem envs, degrada com aviso e exit 0 na parte A; checks pré-F12 marcam "n/a" quando tabela/coluna não existem
- [ ] Parte C: com navegador — screenshots fora do git (`.gitignore` confere) e apagadas/registradas após conferência; sem navegador — "não executada" registrado. README permite o Johnny reexecutar sozinho após qualquer deploy
- [ ] Nenhum segredo/dado real em arquivo, log ou commit (grep no diff por `SMOKE_SENHA`/e-mail de teste → só leituras de env); `lint` limpo; rascunho para `DECISOES.md`

---

## §W6 — Subagente W6 (ONDA 3): revisão adversarial + correções da auditoria + emendas + relatório

Você é um subagente executando a frente **W6** da OS-F12, sobre W1–W5 integrados. Corrija o que achar; registre tudo.

1. **Corrigir os achados do W4** (críticos/altos obrigatórios; médios se couber; baixos → pendência) — causa raiz, com o padrão da casa.
2. **Adversarial da F12**: kit aplicado sobre lote incompatível; kit desativado some do fluxo mas não do histórico de quem o usou (payload é cópia no form — nada referencia o kit depois); mínimo 0/negativo (schema barra); badge "repor" vs badge "faltam N" convivendo; visão por filial (F11) com a coluna Total + repor; dashboard com 0 itens a repor; RLS da `kits_modelos` (anon não lê; authenticated lê/escreve); viewer por senha não vê kits nem mínimo além do que já via.
3. **E2E em DEV** (roteiro 12–15 passos cobrindo I5 + M12 + as áreas do W4) — documentado.
4. **Emendas**: `README.md` (F12), `CHANGELOG.md`, `docs/prompts/README.md` (linha F12), `docs/DECISOES.md` (entrada `2026-07-22 · F12` com as decisões §2 + rascunhos), `docs/BACKLOG-UX.md` (I5 e M12 saem de "Já previstos" — concluídos), `docs/prompts/F5-refino.md` (5.9 concluído aqui; estoque mínimo idem; anotar que "um item por sessão" foi revogado nesta OS por decisão), `docs/ESPECIFICACAO.md` (§5: coluna `estoque_minimo` e tabela `kits_modelos`; §6: aplicar-kit no fluxo), `src/lib/ajuda/conteudo.ts` (+ teste): estoque mínimo agora **existe** (reescrever o trecho que a F9 corrigiu, agora afirmativo: "Falta" continua sendo atrelados − estoque; **"Repor"** é estoque abaixo do mínimo configurado em Administração → Itens) + bloco dos kits.
5. **`docs/RELATORIO-F12.md`** (pt-BR, evidências): o que mudou por frente; a lista dos commits auditados com veredito; saídas **reais** de `lint`/`test`/`build`; saída do smoke baseline e pós-deploy (status/contagens — sem dados reais, senha mascarada); decisões; pendências (incluindo envs ausentes ou fallbacks disparados).

### Aceite W6

- [ ] Achados do W4 tratados (ou pendência justificada); adversarial e E2E documentados; docs emendados; relatório completo
- [ ] `lint`+`test`+`build` limpos na base final

---

## §2 — Escopo e decisões (Johnny, 22/07/2026) — autoridade

1. **Escopo:** M12 (kits — **só preset de movimentação**, sem lançar itens por quantidade junto: decisão do Johnny), I5 (estoque mínimo), auditoria dos commits sem smoke + smoke logado. **F6C está FORA** (decisão do Johnny — não prepare nem execute carga de saldos). Alertas por e-mail (F5 §5.2/5.3), upload de PDF (5.5) e o resto da F5 continuam fora.
2. **Processo:** esta OS **agrupa dois itens da F5 + auditoria numa sessão só e trabalha direto na `main`**, por decisão explícita do Johnny (revoga, para esta OS, o "um item = um branch = uma sessão" do F5-refino — registrar em DECISOES). Push **só nos marcos §1.4** porque push = deploy.
3. **Banco:** migrations **aditivas** aplicadas em produção pelo orquestrador via `RUNBOOK-BANCO.md`, com backup lógico antes e conferência depois; qualquer coisa destrutiva é proibida; bloqueio do ambiente → fallback SQL-pronto (precedente 0034).
4. **I5:** mínimo é **por item, comparado ao estoque consolidado** (não por filial — por-filial exigiria tabela própria e fica para quando o uso pedir; registrar). `0` = sem alerta.
5. **M12:** shape da F5 §5.9 (`kits_modelos` com `payload jsonb`); aplicar-kit sobrescreve config com aviso (padrão "Repetir última"); checklist de categorias é **informativo**, nunca bloqueia; kit é cópia no momento do uso — desativar kit não afeta movimentações passadas.
6. **Smoke:** credenciais **exclusivamente via env** (§1.5); a conta de teste é dedicada a smoke; relatório só com status/contagens (nunca conteúdo de produção); o script fica no repo (`scratchpad/smoke/`) **sem** segredos, reexecutável pelo Johnny após qualquer deploy futuro.
7. **Idioma:** narrativa/relatório/UI pt-BR; código/identificadores em inglês; commits pt-BR estilo conventional.

## §3 — Aceite geral (orquestrador)

- [ ] Gate §1.0; ondas na ordem; propriedade §1.3 respeitada; push só nos marcos §1.4
- [ ] Aceites W1–W6 completos; kits + estoque mínimo **no ar em produção**; ensaio <60s do kit registrado
- [ ] Smoke baseline executado ANTES do rollout (achados corrigidos ou registrados) e smoke logado pós-deploy com exit 0 — saídas no relatório
- [ ] Migrations 0041/0042 aplicadas em produção com backup prévio (ou fallback §1.4.7 documentado); **nada destrutivo executado**
- [ ] Zero dependência nova; zero segredo/dado real em arquivo/commit/log/relatório; custo R$ 0; invariantes §1.2.8 intactas
- [ ] `npm run lint` + `npm run test` + `npm run build` verdes na base final — saídas reais no `RELATORIO-F12.md`
- [ ] Docs emendados (README, CHANGELOG, prompts, DECISOES, BACKLOG-UX, F5-refino, spec, ajuda); resumo final em pt-BR apontando o relatório
