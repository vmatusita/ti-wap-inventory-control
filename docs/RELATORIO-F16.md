# Relatório da F16 — Melhorias de leitura e navegação no relatório (UX)

Documento de **evidências** da ordem [`docs/prompts/F16-relatorio-ux.md`](prompts/F16-relatorio-ux.md), executada em 23/07/2026 na branch `f16-relatorio-ux`. Seis melhorias de UX no relatório (ao vivo e snapshots), com a régua **zero migration · zero RPC nova/alterada · zero dependência nova · compatível com snapshots já gerados**.

As **decisões** estão em [`docs/DECISOES.md`](DECISOES.md), entrada **2026-07-23 · F16**. Aqui ficam os fatos verificáveis: o que mudou por tarefa, o achado do T1 sobre as agregações, as saídas reais dos gates, o resultado das 5 lentes e o que **não** ficou provado.

Evidências jamais contêm dado real da WAP (regra 2 do CLAUDE.md): os exemplos são fictícios (`WAP0001234`/"Fulano") e as contagens, agregadas.

---

## 1. O que mudou, por tarefa

### T1 — Estornos sinalizados nas tabelas detalhadas
Toda linha do período cuja movimentação foi **estornada** nasce sinalizada: a linha fica **esmaecida** e ganha a marca **"estornada"** (com a data no `title`/hover), visível ao operador **e** ao visualizador por senha, **presente na impressão**. Vale para as três tabelas de ativos (Saídas, Entradas, Transferências) e para a de itens; nesta última, além do lançamento **de** estorno (`ehEstorno`, que já existia), fica marcado também o lançamento **estornado**.

- **Mecanismo (descoberto, não presumido):** não existe coluna "estornada". O estorno é inferido pela existência de OUTRA linha apontando de volta — `movimentacoes.tipo='estorno'` + `estorno_de` (ativos) e `lancamentos_item.estorna_id` (itens) —, a mesma doutrina que a linha do tempo da ficha (`linha-do-tempo.tsx`) já usava.
- **Builders:** `buscarEstornosAteData` (queries/relatorios/movimentacoes.ts) e `buscarLancEstornadosAteData` (itens.ts) montam um `Map<idOriginal, dataDoEstorno>` **as-of `periodo.ate`** e o builder marca as linhas com `...marcaEstorno(...)`. Campos **opcionais** `estornada?`/`estornoData?` (tipos.ts). Função pura `marcaEstorno` (lib/relatorios/estorno.ts) + teste.
- **UI:** `CelulaPatrimonio` + `BadgeEstornada` (celulas.tsx); linha esmaecida via `bg-muted/40 text-muted-foreground` no `<TableRow>`.
- **NENHUMA contagem mudou** (ver §3 — achado do T1).

### T2 — Δ dos KPIs com semântica por indicador
A **cor** do Δ passou a ter sentido: `corDelta(chave, delta)` (lib/relatorios/delta-kpi.ts, puro + teste) devolve **verde** (bom), **vermelho** (ruim) ou **neutro** (cinza) segundo o mapa `SENTIDO_KPI` — subir é bom em "Em estoque"/"Guardados", ruim em "Em manutenção"/"Em triagem", neutro nos demais (Total, Em uso, Reservados, Reserva técnica, Emprestados). A **seta ▲▼ permanece** (a cor nunca é o único canal). Vale para `KpiTiles` e `GrupoKpis`. Dashboard (não passa `anterior`) e snapshots **v1** (sem `kpisAnterior`) seguem sem Δ.

### T3 — Busca livre + patrimônio → ficha
Cada tabela detalhada ganhou um **campo de busca livre** (`filtros-tabela.tsx`) que filtra as linhas já carregadas em qualquer coluna textual, **sem sensibilidade a caixa/acento** e com **patrimônio fora do formato canônico** ("wap 1234" acha `WAP0001234`, via `canonicalizarPatrimonio`). Persiste na URL sob `<prefixo>.q` (`sd.q`/`en.q`/`tr.q`/`mi.q`), compõe com os filtros e mantém a contagem "X exibida(s)" correta. Núcleo puro em `use-filtros-tabela.ts` (`lerBuscaDaQuery`/`escreverBuscaNaQuery`/`casaBusca`) + testes no padrão do arquivo. Transferências e movimentações de itens viraram Client Components para usar o hook.

Para o **operador**, o patrimônio das linhas e dos cards de manutenção vira **link para `/ativos/[id]`** (campo opcional `ativoId?` exposto pelos builders). Visualizador por senha e snapshots antigos (sem `ativoId`): **texto puro**.

### T4 — KPI tiles clicáveis no ao vivo
No relatório **ao vivo**, para o **operador**, os KPI tiles (e os do grupo) linkam para `/ativos` já filtrado por status (`?status=…`, CSV, espelho do `LINKS_KPI` do dashboard) e por filial (`&filial=<id numérico>`) quando não é o consolidado. `linksKpiAtivos` (lib/relatorios/kpi-links.ts, puro + teste); a página ao vivo monta os links só quando `ehOperador` e os passa por `CorpoRelatorio → CorpoRelatorioV2 → KpiTiles/GrupoKpis`. Snapshot congelado e viewer: **sem links**. Dashboard intacto.

### T5 — Conteúdo escondido no mobile com porta de entrada
Nas larguras em que as tabelas escondem colunas, cada linha ganhou uma **setinha (chevron)** (`aria-expanded`, alvo de toque **≥ 40px**) que revela por toque os campos ocultos como pares **rótulo:valor**. Cobre as 4 tabelas detalhadas + a **Obs** da tabela de saldo por item (grupos 2–3). Helper compartilhado `linha-expansivel.tsx` (`BotaoExpandir`, `LinhaDetalhe`, `useExpandidas`). Cada campo revelado usa o breakpoint **inverso** ao `hidden <bp>:table-cell` da sua coluna; o chevron e a linha de detalhe são **`print:hidden`** e somem no breakpoint em que nada fica escondido (`xl` nas saídas/entradas, `lg` nas transferências/itens) — **desktop e impressão não mudam**.

### T6 — Manutenção parada escala aos 30 dias
Um caso **em aberto** parado há **≥ 30 dias** (`MANUTENCAO_ALERTA_DIAS`, constante nomeada) escala: o badge "há N dias" passa de âmbar para **vermelho** (para operador e viewer — o card é público). Só para o operador, aparece em **Pendências** um chip **"Manutenção parada (30+ dias)"** com a contagem, derivado do próprio array de manutenção (sem tocar `v_pendencias`, sem migration; gate `incluirPendencias` no builder). Predicado `manutencaoEmAlerta` e `chipManutencaoParada` puros (lib/relatorios/manutencao-alerta.ts) + teste.

### Transversal — ajuda e spec
- **Ajuda** (`src/lib/ajuda/conteudo.ts`, seção `relatorios`): notas novas sobre busca livre, patrimônio→ficha e tiles clicáveis (operador), Δ semântico, estorno sinalizado (sem mudar contagem), manutenção 30+ dias e tabelas expansíveis no mobile — com teste travando o conteúdo (`conteudo.test.ts`).
- **Spec** (`docs/ESPECIFICACAO.md` §7): `(Emenda F16)` nos itens 1, 2, 6–8 e na intro (mobile).

---

## 2. Arquivos (por que cada um mudou)

| Arquivo | Por quê |
|---|---|
| `lib/relatorios/estorno.ts` (+test) | T1 — `marcaEstorno` puro |
| `lib/relatorios/delta-kpi.ts` (+test) | T2 — `SENTIDO_KPI` + `corDelta` puros |
| `lib/relatorios/kpi-links.ts` (+test) | T4 — `linksKpiAtivos` puro |
| `lib/relatorios/manutencao-alerta.ts` (+test) | T6 — limiar + predicado + chip puros |
| `lib/relatorios/tipos.ts` | T1/T3 — campos opcionais `estornada?`/`estornoData?`/`ativoId?` |
| `lib/queries/relatorios/movimentacoes.ts` | T1 (estorno as-of) + T3 (`ativos.id` no embed) |
| `lib/queries/relatorios/itens.ts` | T1 — lançamento estornado |
| `lib/queries/relatorios/estoque.ts` | T3 — `ativoId` no caso de manutenção |
| `lib/queries/relatorios/snapshot.ts` | T6 — chip de manutenção (só operador) |
| `components/relatorios/use-filtros-tabela.ts` (+test) | T3 — busca livre no hook |
| `components/relatorios/filtros-tabela.tsx` | T3 — campo de busca |
| `components/relatorios/celulas.tsx` | T1/T3 — `CelulaPatrimonio` + `BadgeEstornada` |
| `components/relatorios/kpi-tiles.tsx` | T2/T4 — Δ semântico + `links` no GrupoKpis |
| `components/relatorios/manutencao-casos.tsx` | T3/T6 — link + badge vermelho |
| `components/relatorios/linha-expansivel.tsx` | T5 — helper de expansão |
| `components/relatorios/tabela-{saidas,entradas,transferencias,mov-itens,itens-grupo}.tsx` | T1/T3/T5 |
| `components/relatorios/corpo-relatorio{,-v2}.tsx` | T3/T4 — threading de `ehOperador`/`links` |
| `app/(app)/relatorios/[filial]/page.tsx` | T4 — monta `links` no ao vivo (operador) |

---

## 3. Achado do T1 — as agregações contam as estornadas (pergunta aberta ao Johnny)

Investigação pedida pela ordem. As contagens de **movimentação** do relatório — contagem no **título** das tabelas (`rows.length`), **chips de resumo**, **série** (saídas×devoluções), **"por motivo"** (`rel_por_motivo`) e **resumo do e-mail** (`rel_resumo`) — contam a movimentação **original** mesmo quando ela foi depois **estornada**: o estorno (`tipo='estorno'`) fica fora das listas de tipo dessas tabelas, mas a original permanece contada. **Só o ESTADO as-of** (KPIs, via `rel_estoque_asof`, CTE `efetivas`) desconta o par mov+estorno.

A F16 **não mudou nenhuma dessas contagens** (fora de escopo — mexer nelas altera números históricos e RPCs). **Pergunta aberta** (registrada em DECISOES): as contagens de movimentação deveriam descontar as estornadas? Hoje medem "eventos registrados no período", não "eventos líquidos". Decisão do Johnny, fora desta ordem.

---

## 4. Evidências — gates (saídas reais)

**Baseline** (antes de começar, na branch, código = `main`):
```
LINT_EXIT=0
Test Files  46 passed (46)
     Tests  947 passed (947)
BUILD_EXIT=0
```

**Final** (após todas as tarefas + docs + correção de impressão):
```
LINT_EXIT=0
Test Files  50 passed (50)
     Tests  993 passed (993)
✓ Compiled successfully
BUILD_EXIT=0
```

**Contagem de testes: 947 → 993 (+46), nenhum deletado/pulado.** Novos: `estorno` (6), `delta-kpi` (10), `kpi-links` (5), `manutencao-alerta` (9), busca no hook (`use-filtros-tabela.test.ts`, +15), ajuda (+1). Todas as funções puras da ordem (mapa do Δ, predicado da busca, limiar, marcação de estorno, links) foram extraídas e testadas.

Cada tarefa (T1→T6) rodou `lint` + `test` + `build` verdes e foi commitada isoladamente na branch `f16-relatorio-ux`.

---

## 5. Revisão adversarial — 5 lentes

Cinco lentes independentes em contexto fresco (subagentes paralelos, esforço alto, refutação por padrão), no padrão F14/F15:

| Lente | Foco | Resultado |
|---|---|---|
| 1 — Estado/as-of e contagens | marcação de estorno as-of; efeito colateral do `ativos.id` no embed; chip em pendências; índice único dos itens; ordem/paginação do novo `Promise.all` | **LIMPA** |
| 2 — RLS e viewer por senha | href novo para o viewer; vazamento do chip de manutenção; `ativoId` congelado no snapshot; client components novos | **LIMPA** |
| 3 — Compatibilidade v1/v2 | snapshot v2 pré-F16 abre sem os recursos novos; v1 sem Δ; `DeltaKpi` com `chave` obrigatória; alcance do Δ semântico; `schema` continua 2 | **LIMPA** |
| 4 — Mobile e impressão | reveal por breakpoint inverso; sumiço do chevron/detalhe no bp certo; impressão; colSpan; scroll lateral | **1 achado (média)** — corrigido (ver abaixo) |
| 5 — Testes e regressão | cobertura das funções puras; teste enfraquecido/deletado; alargamento de `LinhaFiltravel.tipo`; separador/canonicalização da busca | **LIMPA** |

**Achado da lente 4 (média) — coluna do chevron sem `print:hidden`:** a coluna do chevron (`TableHead`/`TableCell`, `w-10 p-0 <bp>:hidden`) tinha só o `<bp>:hidden`; na impressão (papel A4 ≈ 794px, abaixo de `lg`/`xl`) o media query `min-width` não casa e a coluna continuaria visível — vazia, porque o botão é `print:hidden` —, adicionando uma coluna de ~40px à esquerda de cada tabela na impressão (regressão que a F16 se comprometeu a não causar).

**Correção:** `print:hidden` acrescentado ao `TableHead` **e** ao `TableCell` da coluna do chevron nas **5 tabelas** (commit `a41e290`, aplicado ANTES do fim da revisão — a lente 4 leu o estado pré-correção). **Re-verificação:** `grep` confirma que as 10 células do chevron (2 × 5 tabelas) têm `print:hidden` e nenhuma ficou sem. As demais quatro lentes voltaram limpas. **Nota honesta:** eu já havia identificado e corrigido este mesmo defeito por conta própria antes de a revisão terminar — a lente 4 o confirmou de forma independente, o que aumenta a confiança de que era real.

---

## 6. Verificação de RLS / viewer por senha

O requisito: renderizando como visualizador por senha (`ehOperador=false`), **nenhum href novo** pode aparecer. Verificado por três caminhos convergentes (o live E2E autenticado é barrado pelo login wall — ver §9):

1. **Auditoria independente (lente 2 — LIMPA):** um subagente adversarial rastreou todas as fontes de href novas e confirmou o corte.
2. **Rastreio direto (grep) de cada site de href novo e sua guarda:**
   - `celulas.tsx` (`CelulaPatrimonio`): `const linkavel = ehOperador && ativoId` — só vira `<Link>` quando **ambos**.
   - `manutencao-casos.tsx`: `{ehOperador && c.ativoId ? <Link…> : <span…>}`.
   - `kpi-tiles.tsx` (`KpiTiles` e `GrupoKpis`): só há `<Link>` quando `href = links?.[chave]` existe; `links` **só** é montado pela página ao vivo `const links = ehOperador ? linksKpiAtivos(filialId) : undefined`, e a página do **snapshot congelado NÃO passa `links`** (`<CorpoRelatorio snapshot ehOperador />`, sem `links`).
   - Logo, o viewer (ehOperador=false) recebe **zero** href novo, e nem o operador vê tile clicável num snapshot congelado (só no ao vivo).
3. **Render público a 375px:** `/relatorios/acesso` (a porta do viewer) renderiza sem overflow horizontal e sem erro de console (o app compila e serve).

Além disso, o chip "Manutenção parada" é gateado **duas vezes**: no builder (`incluirPendencias`, que é `false` para o viewer) e no render (`ehOperador && s.pendencias.length > 0`) — defesa em profundidade, como o resto das Pendências.

---

## 7. Deploy e smoke

<!-- PREENCHER após merge -->

---

## 8. Pendências (backlog desta ordem)

- **Contagens de movimentação × estornadas** (achado do T1, §3): decisão do Johnny para uma fase futura.
- **Empty state "no período" com busca ativa:** nas Saídas/Entradas, quando a busca/filtro reduz a zero, a mensagem ainda diz "Nenhuma saída/entrada no período" (comportamento **pré-F16**; Transferências e mov-itens já dizem "encontrada"). Fora do escopo declarado; anotado.
- **Itens explicitamente adiados** (não implementados, por ordem): selo "repor" no relatório, snapshot automático da sexta, motivo da regeração, T11 (definições de semana), export/HTML autocontido.

---

## 9. O que este relatório NÃO prova

- **Sem E2E autenticado das tabelas do relatório** (login wall): as telas de relatório ficam atrás de login de operador (Supabase) ou senha de acesso, e este ambiente não insere credenciais. A verificação em navegador ficou limitada às **páginas públicas** (`/relatorios/acesso` renderiza a 375px sem overflow horizontal e sem erro de console — o app compila e serve). O comportamento das 4 tabelas a 375px (expansão por toque), o link do patrimônio, os tiles clicáveis e a badge de estorno **não puderam ser exercitados ao vivo** — foram verificados por leitura de código, testes de função pura e o build tipado.
- **A cor semântica do Δ, a badge vermelha de 30+ dias e a porta de expansão no mobile** aplicam-se também a snapshots v2 **pré-F16** (o dado já está congelado); isso é intencional (§ DECISOES) — não é um recurso data-gated. Os recursos que dependem de campo novo (estorno sinalizado, `ativoId`→link, chip de manutenção no builder) **não** aparecem em snapshots antigos.
- **Não há fixtures de snapshot v1/v2 pré-F16 no repositório** para um teste automatizado de "abre sem erro"; a compatibilidade foi garantida por construção (campos opcionais, render tolerante à ausência) e revisada pela lente 3.
