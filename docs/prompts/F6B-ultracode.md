# OS-F6B (ultracode) — Melhorias de UX em execução paralela

Versão **executável e detalhada** da `F6B-melhorias-ux.md`, para o Claude Code com orquestração multi-agente. As decisões do Johnny (16/07/2026) estão repetidas dentro de cada fase — são autoridade, junto com a spec.

**Modo autônomo com acesso total (CLAUDE.md):** nenhum agente pede autorização. Sistema **em produção com dados reais** — autoproteções obrigatórias (backup antes de migration que toca dado, contagens, smoke).

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code na raiz do repositório. O orquestrador (sessão principal) segue a §1; os blocos §W1–§W4, §B1 e §B9 são os prompts completos de cada subagente.

---

## §1 — Orquestração (sessão principal)

### 1.0 GATE de entrada — não pule

A F6B só começa com a **F6A concluída e em produção**. Verifique: (a) `README.md` marca a F6A como concluída; (b) migrations `0027` e `0028` aplicadas em produção (`supabase migration list` ou MCP); (c) working tree limpo na `main` e CI/build verde; (d) a página `/pendencias` existe e `rel_saldo_itens` devolve `total/estoque`. Se algo faltar, PARE e reporte — não comece a F6B por cima de uma F6A pela metade.

### 1.1 Grafo de execução

```
ONDA 1 (paralela)                      INTEGRAÇÃO 1              ONDA 2 (paralela)         FINAL
┌─ W1: B2 semana + B3 resumo ────┐
├─ W2: B4 obs + B5 tabela itens ─┼→ merge W1→W2→W3→W4     ┌─ B1 loading ─┐    merge B1→B9
├─ W3: B6 termo + B7 patrimônio ─┤   lint/test/build   →  └─ B9 ajuda ───┘ →  build → migration 0030
└─ W4: B8 sessões 24h ───────────┘   (sem deploy ainda)                        → deploy ÚNICO → smoke → resumo
```

- **Onda 1**: W1–W4 são independentes (arquivos disjuntos, ver §1.3). Lance os 4 subagentes de uma vez, worktrees `f6b-w1`…`f6b-w4`.
- **Onda 2 depois da integração 1**, porque: **B9 documenta** as features no estado final (rótulos novos de itens da F6A, confirmar assinatura, corrigir patrimônio, obs no snapshot, semana default) e **B1 esqueletiza** as telas como elas ficaram. Branches `f6b-b1`, `f6b-b9`.
- **Deploy é um só, no final.** Nenhum subagente aplica migration em produção nem deploya — só o orquestrador.

### 1.2 Regras globais (valem para todo subagente)

1. Desenvolvimento contra Supabase **DEV/local**; produção é só do orquestrador, no final.
2. **Migrations pré-alocadas** (últimas aplicadas: `0027`, `0028`; a `0029` ficou reservada à F6A — **não usar**):
   - `0030_relatorios_gerados_observacao.sql` → **W2 (B4)**
   - `0031_*` → **W2 (B5)**, somente se optar por RPC (a rota preferida é query direta, sem migration)
   - B6, B7, B8, B1, B9: **sem migration** (desenho abaixo não precisa; se algum agente concluir que precisa, PARE o item e reporte ao orquestrador em vez de criar por conta)
3. **Stack fechada — NENHUMA dependência nova** (isso derruba especialmente atalhos óbvios do B1: nada de nprogress/toploader). **Custo R$ 0. Nenhum dado real** em código/teste/fixture/screenshot.
4. Convenções do CLAUDE.md: pt-BR, Server Actions + Zod para toda escrita, leituras em `src/lib/queries/`, shadcn intocado em `src/components/ui/`, datas `dd/MM/yyyy`, `tabular-nums` em números de tabela.
5. **Regra 6 do CLAUDE.md** (doc atual antes de codar) é crítica em: `useLinkStatus`/`loading.tsx` do Next 16 (B1) e expiração de sessão do `@supabase/ssr` (B8). Use o MCP Context7/doc oficial — não confie em API de memória.
6. Cada subagente entrega: código na branch + checklist autoverificado + rascunho para `docs/DECISOES.md` + pendências. `lint`+`test`+`build` limpos no worktree. Testes Vitest para função pura nova/alterada.

### 1.3 Mapa de propriedade de arquivos (anti-conflito)

| Dono | Arquivos |
|---|---|
| **W1** (B2+B3) | `src/lib/relatorios/periodo.ts` + `periodo.test.ts`, `src/lib/relatorios/resumo.ts` + teste, `src/components/relatorios/periodo-filtro.tsx`, `src/components/relatorios/resumo-periodo.tsx` |
| **W2** (B4+B5) | `supabase/migrations/0030*`, `src/lib/actions/relatorios.ts`, `src/components/relatorios/gerar-relatorio-dialog.tsx`, `src/lib/relatorios/tipos.ts`, `src/lib/queries/relatorios/snapshot.ts` e `itens.ts` (novo query de lançamentos), `src/lib/queries/gerados.ts`, `src/app/(app)/relatorios/gerados/**`, `src/components/relatorios/corpo-relatorio-v2.tsx` e `corpo-relatorio.tsx`, `chips-ancora.tsx`, novo `tabela-mov-itens.tsx`, novo componente de observação |
| **W3** (B6+B7) | `src/lib/actions/termos.ts` (função nova) e `src/lib/actions/ativos.ts` (função nova), `src/lib/validators/ativo.ts`, `src/app/(app)/ativos/[id]/page.tsx`, `src/components/ativos/*` (dialogs novos), `src/app/(app)/pendencias/page.tsx` + componentes (ação inline), `src/lib/queries/pendencias-detalhe.ts` se precisar |
| **W4** (B8) | `src/lib/auth/senha-sessao.ts`, `src/lib/supabase/proxy.ts`, `src/app/login/page.tsx`, `src/lib/actions/auth.ts` se precisar |
| **B1** (onda 2) | `loading.tsx` novos (arquivos novos por rota), `src/app/(app)/layout.tsx` (ponto de montagem da barra/provider), `src/components/layout/*` (indicador), `src/components/ativos/ativos-filtros.tsx` (usar o isPending descartado), tabs/paginação que navegam |
| **B9** (onda 2) | `src/app/(app)/ajuda/**` (novo), `src/lib/ajuda/**` (novo), `src/components/layout/sidebar-nav.tsx` |

Conflitos esperados: W2 é o único a tocar `corpo-relatorio*`/`tipos.ts` na onda 1; na onda 2, B1 é o único no layout e B9 o único na sidebar. Merge da onda 1 na ordem **W1→W2→W3→W4**; onda 2 **B1→B9**. Se um agente precisar de arquivo de outro, reporta em vez de editar.

### 1.4 Final (orquestrador)

1. Integração 1: merges da onda 1, `lint`+`test`+`build` após cada um. Commits `feat(f6b): w2 — observação no snapshot + tabela de itens` etc.
2. Onda 2, depois merges `B1→B9`, re-teste.
3. Produção: backup da definição atual de `relatorios_gerados` (schema) → aplicar `0030` (e `0031` se existir) → smoke: gerar um snapshot de teste com observação num período curto e abrir; conferir lista de gerados.
4. Deploy único na Vercel; conferir logs/advisors.
5. Smoke manual pós-deploy (roteiro): abrir `/relatorios/geral` sem query (semana dom–sáb default) · resumo com quebras no `;` · gerar snapshot com obs e ver no final do relatório · tabela "Movimentações de itens" no período · confirmar assinatura de um termo `gerado` (some de `/pendencias`) e desfazer · corrigir um patrimônio (rastro na linha do tempo, busca acha pelo novo) · sessão viewer >24h expira (valide via unit test + inspeção do cookie; não dá para esperar 24h) · navegação com skeletons/barra · `/ajuda` abre e busca funciona.
6. Resumo consolidado: checklists por fase, `docs/DECISOES.md` (uma entrada por decisão), `README.md` + `docs/prompts/README.md` atualizados (F6B concluída; próxima: F6C quando houver export). Backlog do que ficou de fora.

---

## §W1 — Subagente W1: B2 semana default (dom–sáb) + B3 quebra de linha no resumo

Você é um subagente executando B2+B3 da OS-F6B no repositório `ti-wap-inventory-control`, branch `f6b-w1`, worktree próprio. Modo autônomo. Sem migration, sem deploy. Escopo: só estes dois itens.

### B2 — período default do relatório: semana atual, domingo a sábado

**Decisão do Johnny:** ao abrir qualquer relatório ao vivo (filial ou consolidado `geral`) sem período na URL, o filtro vem na **semana atual, de domingo a sábado**. Demais presets continuam disponíveis.

**Fatos verificados:**
- `src/lib/relatorios/periodo.ts`: `PRESET_PADRAO = 'ano'` (L19). O preset `'semana'` **existe mas é segunda→hoje** (`startOfWeek(base, { weekStartsOn: 1 })`, L41-53). `PRESETS` (L34-39) alimenta os botões de `src/components/relatorios/periodo-filtro.tsx` (que navega com `?preset=...`). `resolverPeriodo` (L64-81) cai em `PRESET_PADRAO` quando não há preset válido; datas custom via `?preset=custom&de=&ate=`.
- Fuso: tudo deriva de `hojeISO()` (America/Sao_Paulo) — mantenha.
- `resolverPeriodo` é usado **só** em `src/app/(app)/relatorios/[filial]/page.tsx` (L40) — mudar o default cobre filial + geral de uma vez.
- **NÃO confunda** com `semanaUtilCorrente()` (seg–sex, L28-32): é o default do **dialog "Gerar relatório"** e do teto de data da action — outro conceito, **não mexa**.
- Testes existentes fixam o default: `src/lib/relatorios/periodo.test.ts` (`resolverPeriodo({})` → `'ano'`) — vão quebrar e devem ser atualizados.

**Passos:**
1. Preset `'semana'`: `de = startOfWeek(base, { weekStartsOn: 0 })` (domingo). Para `ate`, decida entre `hoje` e `min(sábado, hoje)` — são equivalentes na prática (sábado futuro não tem dados e o teto da action de gerar usa outro cálculo); escolha o que deixar o rótulo honesto e registre. Rótulo segue "Esta semana".
2. `PRESET_PADRAO = 'semana'`.
3. Atualize `periodo.test.ts` (default novo, cálculo dom–sáb com casos de virada: quarta-feira comum, domingo, sábado, virada de mês/ano) — função pura, teste Vitest.
4. Confira que links antigos com `?preset=ano` etc. continuam funcionando (nada muda para URLs explícitas).

**Aceite B2:** abrir `/relatorios/geral` e `/relatorios/<filial>` sem query mostra dom–sáb da semana corrente; botões de preset seguem funcionando; testes novos passam; dialog de gerar snapshot continua seg–sex.

### B3 — resumo do período: cada `;` vira quebra de linha

**Decisão do Johnny:** no resumo em formato de e-mail, os segmentos separados por `;` quebram linha em vez de ficarem lado a lado. Vale **em todos os lugares** (ao vivo, snapshot novo, snapshot antigo, impressão).

**Fatos verificados:**
- O texto é gerado por `gerarTextoResumo` (**função pura**, `src/lib/relatorios/resumo.ts` L54-64). O `;` nasce em `blocoTipo` (L40-51): `f.motivos.map(...).join('; ')` numa linha só por filial: `• Matriz (8) — novo colaborador: 04 notebooks; troca: 02 desktops`.
- Renderização: `ResumoPeriodoCard` (`src/components/relatorios/resumo-periodo.tsx`) joga o texto num `<pre className="whitespace-pre-wrap ...">` — **quebras `\n` na string já viram quebra visual**. O botão "Copiar texto" usa a mesma string (a cópia ganha as quebras também — desejável). Impressão usa o mesmo `<pre>` (só o botão é `print:hidden`).
- **O snapshot congela o resumo como OBJETO** (`ResumoPeriodo`), não como texto: o texto é regerado no render por `gerarTextoResumo` → **mudar a função pura corrige ao vivo + snapshots antigos v1 e v2 + impressão de uma vez**, sem migração de dado. Os dois corpos (v1 e v2) usam o mesmo card.

**Passos:**
1. Em `blocoTipo`, troque a montagem: linha da filial vira cabeçalho (`• Matriz (8) —`) e cada motivo vira linha própria indentada (ex.: `  novo colaborador: 04 notebooks, 04 monitores`). Decida se o `;` permanece visível no fim de cada linha (recomendado: não — a quebra o substitui) e registre.
2. Teste Vitest da função pura cobrindo: filial com 1 motivo, com N motivos, os dois tipos (saídas/devoluções), resumo vazio.
3. Confira visualmente (dev): ao vivo, um snapshot congelado antigo e o preview de impressão.

**Aceite B3:** cada motivo em linha própria nos 4 contextos; "Copiar texto" copia com as quebras; testes passam; `lint`+`test`+`build` limpos no worktree; rascunho para `DECISOES.md`.

---

## §W2 — Subagente W2: B4 observação no snapshot + B5 tabela de movimentações de itens

Você é um subagente executando B4+B5 da OS-F6B, branch `f6b-w2`, worktree próprio. Modo autônomo. A migration `0030` (e `0031` se necessária) será aplicada em produção pelo orquestrador. Sem deploy.

### B4 — observação ao gerar o snapshot

**Decisão do Johnny:** campo de texto livre opcional ao gerar; aparece **no final do snapshot, junto do resumo do período em formato de e-mail**, com destaque; visível para operador e visualizador. Snapshots sem obs não mostram seção vazia.

**Fatos verificados:**
- Action `gerarRelatorio` (`src/lib/actions/relatorios.ts`): schema Zod atual `{filialSlug, de, ate}` (L17-21); insert em `relatorios_gerados` com `{periodo_de, periodo_ate, filial_id, versao, dados, gerado_por}` (L96-107); versão = `max+1` por (período, filial), `filial_id null` = geral.
- Tabela `relatorios_gerados` (migration `0010` + unicidade do geral na `0013`): **não tem coluna de observação**. Imutável (sem update/delete).
- Dialog `GerarRelatorioDialog` (`src/components/relatorios/gerar-relatorio-dialog.tsx`): campos De/Até/Escopo — sem texto livre.
- `SnapshotRelatorioV2['meta']` = `MetaSnapshot & {schema: 2}` (`src/lib/relatorios/tipos.ts` L91-101) — ponto de extensão natural; **o padrão da casa é campo OPCIONAL mantendo `schema: 2`** (`ehSnapshotV2` testa `=== 2` estrito; um schema 3 cairia no render v1 e quebraria — NÃO bump).
- Lista `/relatorios/gerados` mostra Período·Filial·Versão·Por·Em·Abrir (`listarRelatoriosGerados` em `src/lib/queries/gerados.ts` lê colunas, não o jsonb). Página `[id]` renderiza `<CorpoRelatorio snapshot ehOperador />` + banner de meta.
- Ordem do corpo v2: ... Tabelas → "Resumo do período" (`ResumoPeriodoCard`) por último.

**Desenho recomendado (valide e registre):** gravar nos **dois lugares** — coluna `observacao text` na tabela (migration `0030`, para a lista/queries sem parsear jsonb) **e** `meta.observacao?: string` dentro do snapshot congelado (para o corpo renderizar de forma autossuficiente, inclusive para viewer e em qualquer versão). Render: componente novo (ex. `ObservacaoCard`) logo **após** o `ResumoPeriodoCard` no corpo v2, com destaque no acento WAP (`#eda100` — borda/fundo suave), título "Observações da semana". Só renderiza se houver texto. Não mexa em `resumo-periodo.tsx` (é do W1).

**Passos:**
1. Migration `0030_relatorios_gerados_observacao.sql`: `alter table ... add column observacao text` (nullable; tabela imutável continua sem update/delete). Comente.
2. Action: Zod ganha `observacao: z.string().trim().max(2000).optional()`; insert grava coluna + injeta `meta.observacao` no snapshot congelado ANTES do insert (o ao vivo não tem obs — ela é do ato de gerar).
3. Dialog: `Textarea` opcional "Observações da semana (opcional)" abaixo do período; passa no submit.
4. Tipos: `MetaSnapshot.observacao?: string`. Render no corpo v2 (e v1? snapshots v1 antigos nunca terão obs — pode omitir; registre). Lista de gerados: exiba um indicador discreto (ícone/tooltip ou coluna) quando houver obs — decida e registre.
5. `db:types` após a migration.

**Aceite B4:** gerar com obs → aparece no final do snapshot com destaque, para operador e viewer; sem obs → nada; snapshot permanece imutável; versão nova pode ter obs diferente; lista indica quais têm obs.

### B5 — tabela de movimentações de ITENS no relatório (seção própria)

**Decisão do Johnny (7/7b):** a melhoria é **só para itens por quantidade** (periféricos/acessórios/componentes) — as tabelas de ativos não mudam. Itens ganham **seção própria**: tabela das movimentações de itens do período (item, quantidade, tipo, filial, pessoa/chamado, data).

**Fatos verificados:**
- `rel_mov_itens` (0016) é **agregado por item** (Σ entradas/saídas) — não serve para lançamento a lançamento.
- `getHistoricoLancamentos` (`src/lib/queries/itens.ts` L140-196) retorna lançamentos individuais mas: usa `createClient()` fixo (não aceita o `DbClient` resolvido — viewer não funcionaria), **não filtra por data**, e pagina por page/pageSize. Não reutilizável direto.
- Schema `lancamentos_item` (0015 + enum `retorno` da 0027): `id, item_id, filial_id, tipo, quantidade, chamado, colaborador, data, observacao, criado_por, estorna_id, created_at`.
- Rótulos prontos pós-F6A em `src/lib/dominio.ts`: `TIPO_LANCAMENTO_META` (entrada→"Entrada", saida→"Liberação", reserva→"Atrelar", liberacao→"Devolução", retorno→"Retorno", ajuste→"Ajuste") + `pillTipoLancamento`.
- Padrão visual das tabelas do relatório: `<section id="..." className="scroll-mt-16 space-y-3 break-before-page">` + `CabecalhoDetalhe` ("Título — N no período") + tabela em `rounded-lg border`; coluna Filial **condicional a `ehGeral`**; células compartilhadas em `celulas.tsx`; vazio → `<p>Nenhuma X no período.</p>`. `TabelaTransferencias` (server component, sem filtros) é o modelo mais simples — siga-o.
- `ChipsAncora` (`chips-ancora.tsx`): âncoras fixas `#principais/#acessorios/#componentes/#saidas/#entradas` + `#transferencias` condicional — a nova seção entra aqui (condicional, como transferências).
- Snapshot: **adicione campo OPCIONAL** `movimentacoesItens?: LinhaLancamentoItem[]` em `SnapshotRelatorioV2` mantendo `schema: 2` (precedentes: `total?/estoque?/saldo?`, `emprestado?`). Snapshots antigos sem o campo → seção não renderiza. Nada de schema 3.
- **Armadilha da F6C (carga futura de saldos):** a carga marcará os lançamentos iniciais com `observacao = 'saldo inicial (go-live)'` (constante `OBS_SALDO_INICIAL` em `scripts/import/carga.ts:427`). Esses lançamentos NÃO são movimentação do período — **exclua-os da tabela desde já** (mesma lição do A1; crie/exporte a constante em `dominio.ts` ao lado de `OBS_CARGA_GOLIVE` e cuidado com o gotcha do `.neq` + NULL: use `.or('observacao.is.null,observacao.neq....')`).

**Passos:**
1. Query nova em `src/lib/queries/relatorios/itens.ts` (ex. `getLancamentosItensPeriodo(client, filialId, periodo)`): PostgREST direto em `lancamentos_item` com embed de `itens(nome, grupo)` e `filiais(nome)`, filtros `data between`, filial opcional, exclusão do marcador de carga, ordenado por `data desc, created_at desc`, com **CAP sensato** (ex. 500 linhas — registre; snapshots não devem inchar sem limite). Sem RPC/migration na rota preferida (`0031` só se o embed se provar inviável).
2. Tipo novo `LinhaLancamentoItem` em `tipos.ts` (`id, data, filial, item, grupo, tipo, quantidade, chamado, colaborador, obs`) + campo opcional no snapshot; monte em `getSnapshotRelatorioV2` no `Promise.all` existente.
3. Componente `tabela-mov-itens.tsx` no padrão `TabelaTransferencias` (server, sem filtros client): section `id="mov-itens"`, `CabecalhoDetalhe titulo="Movimentações de itens"`, colunas Data · [Filial se `ehGeral`] · Item · Grupo · Tipo (pílula `pillTipoLancamento`) · Qtd. (`tabular-nums`, com sinal quando fizer sentido p/ ajuste) · Chamado · Colaborador · Obs. Some quando vazio ou campo ausente (snapshot antigo). Marque `(estorno)` quando `estorna_id` não nulo — decida a apresentação e registre.
4. Posição no corpo v2: após `TabelaTransferencias`, antes do Resumo. `ChipsAncora` ganha `#mov-itens` condicional ("Itens").
5. Impressão: herda o padrão (`break-before-page` se ficar melhor — julgue no preview de impressão).

**Aceite B4+B5 (autoverifique e reporte):**
- [ ] Snapshot gerado com obs mostra o card destacado no final; sem obs, nada; viewer vê
- [ ] Lista de gerados indica obs; coluna nova no banco; `db:types` regenerado
- [ ] Relatório do período (dev) mostra a seção de itens com lançamentos da janela; consolidado agrega e mostra coluna Filial; filial única não mostra
- [ ] Lançamentos com `observacao = 'saldo inicial (go-live)'` NÃO aparecem (teste com linha sintética); observação NULL aparece (gotcha `.neq` verificado)
- [ ] Snapshot novo congela a seção; snapshot antigo (sem campo) abre sem erro e sem seção; schema segue 2
- [ ] Âncora "Itens" aparece só quando a seção existe; impressão ok
- [ ] `lint`+`test`+`build` limpos; rascunhos para `DECISOES.md` (dois lugares da obs, CAP, apresentação de estorno)

---

## §W3 — Subagente W3: B6 confirmar assinatura do termo + B7 corrigir patrimônio

Você é um subagente executando B6+B7 da OS-F6B, branch `f6b-w3`, worktree próprio. Modo autônomo. **Nenhuma migration** — se concluir que precisa de uma, PARE o item e reporte. Sem deploy.

### B6 — confirmar assinatura do termo

**Decisão do Johnny:** botão "Confirmar assinatura" — registra **data + quem confirmou**, o termo sai das pendências. **Sem upload** (PDF assinado segue na F5 item 5.5).

**Fatos verificados:**
- Enum `termo_status`: `sim | nao | enviado | gerado`. Semântica (spec L145): só **`sim`** encerra a pendência; `gerado/enviado/nao/null` contam em `v_pendencias`. Fluxo do papel: `nao → gerado → enviado → sim`.
- **Não existe hoje caminho programático para `sim`** — só a edição manual (`EditarAtivoDialog` → `atualizarDadosCadastrais`, que aceita termo_assinado/termo_data). RLS de `ativos` permite UPDATE a `authenticated` (policy "operador escreve", 0005:27-28) — a action funciona com o client do operador.
- `ativos` tem só `termo_assinado` + `termo_data` (date) — **não há coluna de autor**. O rastro de "quem confirmou" deve viver na tabela `anotacoes` (0017: `ativo_id, texto, criado_por, created_at`, imutável, já renderizada na linha do tempo com autor+data — `linha-do-tempo.tsx` funde movimentações + anotações).
- A geração de termo grava `'gerado'` via `aplicarFlagTermo` (`termos.ts:361-373`) com guard que **não rebaixa** `sim`/`enviado` — não conflita.
- Estorno (0023): estornar a movimentação restaura `termo_assinado/termo_data` do snapshot (anterior à confirmação). Comportamento aceitável — documente no verbete.
- Relatório: a coluna "Termo" da tabela de Saídas lê o valor **histórico da movimentação** (decisão F5A em DECISOES:231) — confirmar assinatura NÃO reescreve relatórios; a cobrança real é via `ativos`/pendências. Mantenha.
- A página `/pendencias` (A5) lista termos pendentes com `colaborador_atual`, datas e link pra ficha — ponto ideal para ação inline.

**Passos:**
1. Action nova (em `src/lib/actions/termos.ts` ou `ativos.ts` — julgue a coesão): `confirmarAssinaturaTermo({ativo_id, data?})` — Zod; guard: só age se `termo_assinado <> 'sim'`; update `{termo_assinado: 'sim', termo_data: data ?? hoje}`; INSERT em `anotacoes` com texto automático padronizado (ex.: `Termo confirmado como assinado (data da assinatura: dd/MM/yyyy).`) — o autor/quando vêm das colunas da anotação; `revalidatePath` da ficha, `/pendencias` e `/relatorios`.
2. Ação inversa `desfazerConfirmacaoTermo({ativo_id})`: volta para `'gerado'` se existir termo gerado cobrindo o ativo (`termos_gerados` contém `ativo_ids`), senão `'nao'`; anotação automática do desfazer. Decida os detalhes e registre.
3. UI ficha: botão "Confirmar assinatura" junto à seção Termos (`termos-da-ficha.tsx`) ou ao Dado "Termo" — visível quando status ∈ {gerado, enviado, nao, null}; dialog mínimo com campo de data (default hoje, max hoje). Depois de `sim`, mostrar "Assinado (data)" + ação discreta de desfazer.
4. UI pendências: nas linhas de tipo "Termo", ação inline "Confirmar assinatura" (mesmo dialog); a linha some ao confirmar (a view exclui `sim`).
5. Confira o realtime/refresh: as contagens de pendência refletem no request seguinte (`revalidatePath` cobre; realtime de `anotacoes` já existe).

**Aceite B6:** confirmar → status "Assinado" na ficha com data; anotação na linha do tempo com autor; some de `/pendencias` e dos chips; desfazer funciona e registra; snapshot congelado antigo não muda; `EditarAtivoDialog` continua funcionando sem conflito.

### B7 — corrigir patrimônio (service tag imutável)

**Decisão do Johnny:** service tag **fixa** (identidade do equipamento, nunca editável); patrimônio **pode ser corrigido**, com rastro na linha do tempo (de → para, quem, quando).

**Fatos verificados:**
- `ativos.patrimonio text not null`; unicidade pelo **par**: índice `ativos_patrimonio_service_tag_uidx (patrimonio, coalesce(service_tag,''))` (0003:61-62). Violação já traduzida em `src/lib/actions/erros.ts:71-73` ("Já existe um ativo com esse patrimônio e service tag.").
- Formato canônico em `src/lib/patrimonio.ts`: `PATRIMONIO_CANONICAL_RE = /^[A-Z]{2,4}\d{7}$/`, `canonicalizarPatrimonio` (aceita `WAP4491` → `WAP0004491`).
- **Não existe edição de patrimônio hoje**: `atualizarDadosCadastrais` só toca specs/hostname/observações/termo; `patrimonio`/`service_tag` só são escritos na criação (compra) e na carga. `patrimonio_original` guarda o valor da planilha — **não tocar**.
- A ficha mostra patrimônio no `<h1>` e service tag no subtítulo; ações ficam no cabeçalho (`EditarAtivoDialog`, `AnotarDialog`).
- Buscas: lista e combobox acham por `patrimonio ilike` e desambiguam duplicados exibindo a service tag — nada a mudar; corrigido o patrimônio, acham pelo novo.
- Congelados NÃO reescrevem (correto e desejado): `relatorios_gerados.dados` e `termos_gerados.dados`+`.docx` guardam o patrimônio como texto da época; o relatório **ao vivo** usa join com `ativos` e reflete a correção. `movimentacoes` não guarda patrimônio.
- Rastro: use `anotacoes` (imutável, autor+data, já na linha do tempo). Não existe tipo de movimentação para isso e movimentações são imutáveis — **não crie tipo novo**.

**Passos:**
1. Action `corrigirPatrimonio({ativo_id, patrimonio_novo})` em `src/lib/actions/ativos.ts`: Zod com `canonicalizarPatrimonio` (rejeita formato inválido com mensagem clara); no-op se igual ao atual; UPDATE `ativos.patrimonio`; violação de unicidade → mensagem amigável existente; INSERT anotação automática `Patrimônio corrigido de WAP0001234 para WAP0004321.`; `revalidatePath` ficha, `/ativos`, `/relatorios`.
2. Dialog "Corrigir patrimônio" no cabeçalho da ficha (ao lado de "Editar dados"): mostra o atual, input do novo (com preview da canonicalização), e a **service tag em read-only com legenda "imutável — identifica o equipamento"**. Confirmação explícita no botão.
3. Garanta que `service_tag` segue fora de TODO schema de edição (`editarAtivoSchema` etc.) — é a regra, confirme com grep.
4. Teste Vitest para a validação pura (canonicalização/no-op) se criar helper.

**Aceite B7:** corrigir muda o `<h1>` da ficha e a busca acha pelo novo; anotação "de → para" na linha do tempo com autor/data; par duplicado rejeitado com mensagem amigável; service tag não editável em lugar nenhum; `patrimonio_original` intacto; termos e snapshots antigos preservam o texto da época; relatório ao vivo reflete; `lint`+`test`+`build` limpos; rascunhos para `DECISOES.md`.

---

## §W4 — Subagente W4: B8 sessões expiram em 24h (operador e visualizador)

Você é um subagente executando B8 da OS-F6B, branch `f6b-w4`, worktree próprio. Modo autônomo. Sem migration, sem deploy. **Regra 6 do CLAUDE.md:** confira a doc atual do `@supabase/ssr` antes de codar a parte do operador.

**Decisão do Johnny:** operador e visualizador expiram em **24h**. Operador: 24h após o login, pede login de novo. Visualizador: redigita a senha após 24h. Dentro da janela, nada muda (sem deslogar no meio do trabalho); revogação de senha continua imediata.

### Fatos verificados

**Visualizador:**
- `src/lib/auth/senha-sessao.ts`: `VIEW_MAX_AGE_SEG = 30 * 24 * 60 * 60` (L64) governa **os dois** pontos — o `exp` do payload assinado (`{sid, exp}`, sem `iat`) e o `maxAge` do cookie `wap_view` (setado em `entrarComSenha`, `src/lib/actions/senhas.ts:96-104`, `path:'/relatorios'`).
- `lerSessaoView` valida assinatura HMAC + `exp` (L93-119), sem banco; `getViewerSession` (`acesso.ts:53-68`) revalida a senha ativa no banco a cada request (revogação imediata — preserve).
- **Armadilha:** cookies emitidos ANTES do deploy carregam `exp` de 30 dias e continuariam válidos por até 30 dias. Mitigue na validação: rejeite payload cujo `exp` esteja além de `agora + 24h + folga` (sessão do regime antigo cai no request seguinte e o gestor redigita a senha — efeito desejado).

**Operador:**
- Login por `signInWithPassword` (`src/lib/actions/auth.ts:24`); sessão nos cookies do Supabase, renovada pelo proxy. **Não há nenhum controle de expiração customizado hoje** e `last_sign_in_at` (disponível no `user` do `auth.getUser()`) não é usado em lugar nenhum.
- Proxy: `src/proxy.ts` → `updateSession` (`src/lib/supabase/proxy.ts`) roda no **Edge** (sem `node:crypto`); valida operador com `await supabase.auth.getUser()` e o comentário exige não inserir lógica entre `createServerClient` e `getUser`. Depois do `getUser` pode.
- Logout existente: action `signOut` (`auth.ts:37-40`), usada no `user-menu.tsx`.
- Login page (`src/app/login/page.tsx`): client, `useActionState`, erros via `toast.error`; **não lê searchParams** — o `?erro=confirmacao` que `auth/confirm/route.ts:56` manda hoje é silenciosamente ignorado (aproveite para consertar junto).

### Passos

1. **Visualizador:** `VIEW_MAX_AGE_SEG` → `24 * 60 * 60` (comentário citando a decisão de 16/07/2026). Em `lerSessaoView`, adicione a rejeição de `exp` além do teto novo (mata cookies do regime de 30 dias). Atualize os testes unitários de `senha-sessao` (existem? se não, crie: assinar/ler, expirado, assinatura inválida, exp além do teto).
2. **Operador (após o `getUser` no proxy):** se `user` existe e `Date.parse(user.last_sign_in_at) + 24h < Date.now()` → encerrar: chame `supabase.auth.signOut()` no client do proxy (confira na doc atual do `@supabase/ssr` o padrão para middleware/proxy — cookies de resposta) e redirecione para `/login?erro=sessao-expirada`. Cuidado: `last_sign_in_at` atualiza a cada **login**, não a cada refresh de token — é exatamente o carimbo que queremos. Valide que o refresh dentro da janela NÃO desloga.
3. **Login page:** ler `useSearchParams` e mapear `erro=sessao-expirada` → toast "Sua sessão expirou, entre novamente." e `erro=confirmacao` → mensagem apropriada (conserto do gap existente). Sem mudar o erro genérico do submit.
4. **Teste de sanidade em dev:** simule as duas expirações (mock do relógio nos testes puros; para o proxy, teste manual alterando o limiar para 1 minuto temporariamente — NUNCA commitar o limiar de teste).

### Aceite (autoverifique e reporte)

- [ ] Cookie viewer novo expira em 24h (payload e maxAge); cookie do regime antigo (exp 30d) é rejeitado no request seguinte
- [ ] Revogação de senha continua imediata; dentro da janela o viewer não é interrompido
- [ ] Operador com `last_sign_in_at` > 24h: próximo request → `/login?erro=sessao-expirada` com toast; relogar funciona; dentro da janela o refresh não desloga
- [ ] `?erro=confirmacao` agora exibe mensagem no login
- [ ] Testes de `senha-sessao` cobrindo os casos; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (mitigação dos cookies antigos, padrão do signOut no proxy conforme doc)

---

## §B1 — Subagente B1 (ONDA 2): loading entre páginas — barra + skeletons

Você é um subagente executando B1 da OS-F6B, branch `f6b-b1`, **depois da integração da onda 1** (as telas que você vai esqueletizar já têm a forma final). Modo autônomo. Sem migration, sem deploy. **NENHUMA dependência nova** — nada de nprogress/toploader/holy-loader; recursos nativos do App Router. **Regra 6:** confira a doc atual do Next 16 (`loading.tsx`, `useLinkStatus`, `useTransition`) antes de codar.

**Decisão do Johnny:** barra de progresso fina no topo em toda navegação + skeletons nas telas pesadas. Nenhuma navegação em tela morta.

### Fatos verificados

- `next 16.2.10`, `react 19.2.4` (pinados). `src/components/ui/skeleton.tsx` (shadcn) já existe.
- `loading.tsx` existem **só** em `/ativos` e `/ativos/[id]` (bons modelos do padrão: header + filtros + tabela fantasma). Não existem em: `/` (dashboard), `/itens`, `/pendencias`, `/relatorios/[filial]`, `/relatorios/gerados`, `/relatorios/gerados/[id]`, `/movimentacoes/nova`, `/admin/*`, `/ajuda` (nascerá na B9 — deixe um loading genérico de grupo cobrir).
- `(app)/layout.tsx` é server component: `AppHeader` (sticky h-14) + aside sidebar + `<main className="min-w-0 flex-1 p-4 md:p-6">{children}</main>`. Barra global precisa de um client component montado no layout.
- **Não há indicador de navegação hoje**; `useLinkStatus` não é usado. Navegações programáticas com `router.push`: `ativos-filtros.tsx` (usa `startTransition` mas **descarta o `isPending`** — `const [, startTransition]`), `FilialTabs`, paginação, dialogs admin, `gerar-relatorio-dialog` (push pós-sucesso).
- Padrões de pending em submit já existem (useActionState/useTransition/useState + texto "…ndo") — **não os refaça**; só complete onde faltar spinner em ação demorada (`gerar-termo-dialog` já tem `Loader2`).
- Forma das telas para skeletons fiéis (colhida do código): **dashboard** = KPIs + card pendências + últimas movimentações + atalhos; **/relatorios/[filial]** = H1+período à esquerda / cluster de ações à direita → tabs de filiais + filtro de período → KPI tiles → cards de gráfico → tabelas; **/itens** = H1+subtítulo / botões → filtros → seções por grupo com tabela (Item/Total/Estoque/Atrelados/Falta) → histórico; **/pendencias** = chips-resumo → tabela com badges; **/relatorios/gerados** = H1 → tabela (Período/Filial/Versão/Por/Em/Abrir); **/gerados/[id]** = banner meta → corpo do relatório (reuse o skeleton do relatório); **/movimentacoes/nova** = wizard em passos.

### Desenho recomendado (valide na doc e registre)

1. **Skeletons (`loading.tsx`) — o mecanismo principal** (Suspense de rota do App Router, zero JS extra): crie para dashboard `/`, `/itens`, `/pendencias`, `/relatorios/[filial]`, `/relatorios/gerados`, `/relatorios/gerados/[id]`, `/movimentacoes/nova` e um genérico para `/admin` (grupo). Cada um ecoa a estrutura real (use os dois existentes como referência de estilo; `Skeleton` do shadcn; sem texto real, sem dado fictício visível).
2. **Barra fina global**: componente client `NavegacaoProgresso` montado no `(app)/layout.tsx` (barra 2-3px no topo, acento WAP `#eda100`, animação CSS de progresso indeterminado). Gatilhos sem lib:
   - Um provider leve (Context) `NavegacaoPendenteProvider` expondo `iniciar()/terminou` — os pontos de navegação programática (`FilialTabs`, `ativos-filtros` — aproveite o `isPending` hoje descartado —, paginações, `PeriodoFiltro`) envolvem o `router.push` em `startTransition` e reportam o `isPending` ao provider.
   - Para os `<Link>` da sidebar/header, use `useLinkStatus` (Next 16) num subcomponente do link para acender a barra/spinner do item.
   - A barra apaga quando `usePathname()`/`useSearchParams()` mudam (navegação concluiu) ou o pending zera. Valide o padrão exato na doc do Next 16 e registre o desenho final.
3. Não exagere: sem barra em ação de formulário (isso é pending de botão, já coberto); sem skeleton em página instantânea (login).

### Aceite (autoverifique e reporte)

- [ ] Com throttling (DevTools, Slow 3G) nenhuma navegação entre as páginas listadas fica em tela morta: skeleton aparece imediatamente e/ou barra anima
- [ ] Skeletons ecoam o layout real (sem "pulo" brusco no swap); tema claro ok, impressão não mostra skeleton
- [ ] Filtros de /ativos agora indicam pending (isPending aproveitado); tabs de filial e período também
- [ ] Zero dependência nova (`package.json` intacto); `useLinkStatus`/padrões validados na doc atual
- [ ] `lint`+`test`+`build` limpos; rascunho para `DECISOES.md` (desenho da barra)

---

## §B9 — Subagente B9 (ONDA 2): página de documentação interna (/ajuda)

Você é um subagente executando B9 da OS-F6B, branch `f6b-b9`, **depois da integração da onda 1** (você vai documentar as features no estado final, incluindo as da F6A). Modo autônomo. Sem migration, sem deploy, sem dependência nova.

**Decisão do Johnny:** página interna **só para operadores** — glossário do significado de cada tag/status + como realizar cada ação. (O visualizador não tem manual.)

### Fatos verificados

- **Não existe página de conteúdo hoje** — a `/ajuda` será a primeira. Rota `/(app)/ajuda` já nasce bloqueada para viewer pelo proxy (viewer só acessa `/relatorios/**`); padrão de página: `getOperador()` + redirect, H1 `text-2xl font-semibold tracking-tight` + subtítulo `text-sm text-muted-foreground`.
- **Fonte dos verbetes — importe do código, não copie texto:** `src/lib/dominio.ts` exporta todos os vocabulários com rótulos prontos: `STATUS_META` (8 status de ativo) + `STATUS_ORDEM`, `TIPO_META` (13 tipos de movimentação), `CATEGORIA_META` (6), `GRUPO_ITEM_META`, `TIPO_LANCAMENTO_META` (6 tipos de lançamento de item, **com `descricao`** — pós-F6A), `TERMO_META` (4 status de termo), `ACESSORIOS_DEVOLUCAO`/`ACESSORIO_ROTULO`. **Gere o glossário iterando esses objetos** — assim ele nunca diverge do sistema. Motivos são tabela (`/admin/motivos`) — no manual, explique o conceito e aponte a tela (não liste valores fixos).
- **Máquina de estados** (para o verbete de cada tipo de movimentação): transições em `0004_maquina_estados.sql` (`status_apos_movimentacao`) — compra→em_estoque; saída (de em_estoque/reservado/em_triagem)→em_uso; empréstimo→emprestado; reserva→reservado; devolução→em_triagem; triagem_ok→em_estoque; envio_manutencao→em_manutencao; retorno_manutencao→em_estoque; marcar_defasado→defasado; descarte→descartado; transferência mantém status (muda filial); ajuste exige status_resultante + justificativa; estorno restaura o snapshot (só a última movimentação). Campos por tipo: `CAMPOS_POR_TIPO` em `src/lib/validators/movimentacao.ts` (saída/empréstimo exigem colaborador OU setor; devolução tem checklist de itens faltantes = o marcado FALTA; ajuste exige justificativa ≥10 chars).
- **Ações a documentar** (passo a passo, uma seção cada): nova movimentação em lote (atalho **N**), entrada por compra (single/lote/faixa, máx 200), estorno (só a última; senão ajuste), anotação na ficha, editar dados cadastrais (só campos não derivados), **corrigir patrimônio (B7 — service tag imutável)**, gerar termo (.docx, preview, editar/baixar; `gerado` ainda é pendência), **confirmar assinatura (B6 — só `sim` encerra)**, lançar item (atalho **L**; 6 tipos com as descrições do `TIPO_LANCAMENTO_META`; Total×Estoque×Atrelados×Falta), estornar lançamento, gerar snapshot (imutável, versionado, **com observação — B4**), relatório ao vivo (período default semana dom–sáb — B2; realtime), pendências (página, buckets), admin (convites só `@wap.ind.br`; senhas de acesso com revogação imediata; filiais; motivos; catálogo de itens).
- **Verbetes de regra:** patrimônio repete — o par patrimônio+service tag é a chave (formato canônico `WAP0004491`, `src/lib/patrimonio.ts`); dois modos de acesso (operador × senha de visualização); snapshots congelados ("fim da errata"); sessões expiram em 24h (B8).
- **Padrão de âncoras** já existente: nav sticky `top-14 z-20` com `<a href="#id">` + sections com `id` e `scroll-mt-16` (`chips-ancora.tsx` é o modelo).
- Sidebar: array `ITENS` em `src/components/layout/sidebar-nav.tsx` — adicione "Ajuda" (ícone `CircleHelp`) no fim.

### Passos

1. **Conteúdo estruturado num módulo**, não espalhado no JSX: `src/lib/ajuda/conteudo.ts(x)` exporta seções tipadas (`{id, titulo, corpo}`) — o glossário construído **importando os META de `dominio.ts`**, os passos a passo como dados. Atualizar o manual depois = editar um módulo.
2. Página `/(app)/ajuda/page.tsx`: H1 "Ajuda" + subtítulo; **sumário sticky** com âncoras (padrão chips-âncora); seções: Conceito (movimentação é a fonte da verdade) → Glossário de status do ativo (badge visual real de cada um — reuse o componente de badge) → Tipos de movimentação (o que pede, o que muda) → Termos → Itens por quantidade (Total/Estoque/Atrelados/Falta + os 6 tipos) → Pendências → Relatórios e snapshots → Como fazer (ações passo a passo) → Administração → Acesso e sessões.
3. **Busca client-side simples**: input que filtra seções/verbetes por texto (componente client leve; sem lib). URL com `#ancora` navegável.
4. Sidebar "Ajuda" no fim; atalho `?` global se for barato (siga `atalho-global.tsx`, com a mesma guarda de foco em inputs) — opcional, registre a decisão.
5. Exemplos SEMPRE fictícios (`WAP0001234`, "Fulano de Tal") — regra 2 do CLAUDE.md; screenshot nenhum.

### Aceite (autoverifique e reporte)

- [ ] Todo status/tag visível no sistema tem verbete (conferência: os 8 STATUS_META, 13 TIPO_META, 6 TIPO_LANCAMENTO_META, 4 TERMO_META, grupos, buckets de pendência) — e o glossário é **derivado de `dominio.ts`** (mudou o rótulo lá, muda aqui)
- [ ] Toda ação executável tem passo a passo (checklist da §Fatos coberto), incluindo as novas da F6A/F6B
- [ ] Viewer não acessa `/ajuda` (proxy) e não vê o item na sidebar; operador acha pela sidebar
- [ ] Busca filtra; âncoras funcionam com o header sticky (scroll-mt)
- [ ] Zero dado real; `lint`+`test`+`build` limpos; rascunho para `DECISOES.md`

---

## §2 — Aceite geral da OS (orquestrador, ao final)

- [ ] Gate de entrada verificado (F6A concluída em produção) antes de começar
- [ ] Onda 1 integrada na ordem W1→W2→W3→W4; onda 2 B1→B9; re-teste após cada merge
- [ ] Migration `0030` (e `0031` se existir) aplicada em produção com backup prévio de definição; `db:types` regenerado
- [ ] Deploy único; logs/advisors conferidos; roteiro de smoke manual da §1.4 executado item a item
- [ ] Checklists das 6 frentes autoverificados; `lint`+`test`+`build` limpos na `main`
- [ ] Zero dependência nova; zero dado real; custo R$ 0
- [ ] `docs/DECISOES.md` consolidado; `README.md` e `docs/prompts/README.md` atualizados (F6B concluída; próxima: **F6C** quando o export dos saldos existir)
- [ ] Resumo final: o que mudou por frente, decisões, pendências/backlog
