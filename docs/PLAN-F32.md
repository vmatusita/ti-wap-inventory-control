# PLAN-F32 — Relatórios v3: a cor vira língua, leitura de relance, interatividade e 3 funções novas

> Ordem de serviço: `docs/prompts/F32-relatorios-v3-ultracode.md` · Fonte normativa: `docs/ANALISE-RELATORIOS-2026-08-10.md` (§2 achados, §4 medições) · Referência visual: `mockups/relatorio-v3-proposta.html`.
> Escrito ANTES de qualquer edição, a partir do mapa de 6 leitores paralelos sobre a área de relatórios (10/08/2026).

## 0. Baseline medido antes de editar

| Comando | Resultado |
|---|---|
| `npx vitest run` | **108 arquivos · 2347 testes · 0 falha** (83 s) |
| `npm run lint` | limpo (sem saída) |
| `npm run contraste` | todos os pares `exigir:true` passam; os ❌ são os `antes:true` registrados de propósito |
| `git status` | 3 arquivos untracked (a análise, esta ordem, o protótipo) — entram no 1º commit |

## 1. O que a exploração corrigiu na leitura da análise

Fatos medidos que mudam ou precisam a especificação (todos registrados depois em `DECISOES.md`):

1. **`STATUS_CHART_COLOR.em_uso` não é hex** — é `'var(--color-brand-azul)'` (`dominio.ts:87`), que resolve para `#2a78d6`. A análise fala em "#2a78d6 mantém": nada a fazer, mas o RV-21 (`--chart-1: var(--brand-azul)`) precisa saber que já existe token.
2. **`rotulo-grafico.ts` só reconhece 2 tokens CSS** (`TOKEN_PARA_HEX`): qualquer cor nova via `var(--…)` que passe por `fillRotuloSegmento` cai em luminância 0 → `fill-white` silencioso. Os 3 hex novos do RV-02 são literais → seguro. **Invariante a não violar:** cor de segmento empilhado ou é hex, ou entra em `TOKEN_PARA_HEX`.
3. **Não há Zod validando snapshot** — nem na escrita (`actions/relatorios.ts`, `dados: snapshot as unknown as Json`) nem na leitura (`queries/gerados.ts`, `r.dados as AnySnapshot`). A retrocompatibilidade é 100% `?:` + fallback no render. Confirma a régua "campo novo é sempre opcional, `schema` nunca sobe" (5 precedentes).
4. **`getGruposItens` já tem `s.item_id` em escopo** (`queries/relatorios/itens.ts`), mas o descarta ao montar `SaldoItemPeriodo` — o RV-09 só precisa usá-lo antes de sair de escopo + ler o catálogo. `minimosDoCatalogo`/`minimoDoItem` já existem em `lib/itens/repor.ts` (usados no dashboard e em `/itens`).
5. **A tabela de Entradas JÁ tem filtro por motivo** (`tabela-entradas.tsx:37`, `CAMPOS = ['filial','categoria','motivo']`) — o RV-12 não precisa acrescentá-lo, ao contrário do que a ordem previu como possibilidade.
6. **`confinamento-viewer.test.ts` varre `src/components/relatorios/*.tsx` dinamicamente** — componente novo já nasce coberto. O que ele NÃO vê é href por prop/variável; para esses o teste tem um bloco dedicado por `.includes()` de string (linhas 142-157). O RV-12 (navegação por clique, href montado em runtime) precisa de bloco novo nesse molde.
7. **`referencia.test.ts:703-716` lê `TILES` de `kpi-tiles.tsx` por regex** e exige que todo `rotulo:` apareça na página de ajuda + a contagem por extenso ("Os sete indicadores do topo"). **Invariante:** a F32 não acrescenta nem remove tile.
8. **A régua de linguagem da ajuda** (`referencia.test.ts:786-838`) proíbe jargão de dev e só admite os patrimônios fictícios `wap0001234`/`wap0004491`. Texto novo de ajuda obedece.
9. **`--chart-1..5` são cinzas oklch idênticos em `:root` E `.dark`** (`globals.css`) — o RV-21 precisa mexer nos dois blocos.
10. **`chips-ancora.tsx` não declara `'use client'`** hoje (delega a `NavRolavel`). O RV-13 (IntersectionObserver) obriga a diretiva no arquivo.
11. **A rota de acesso por senha está em `src/app/(app)/relatorios/acesso/page.tsx`**, não em `src/app/relatorios/acesso/` como o `CLAUDE.md` prescreve. Divergência **pré-existente**, fora do escopo desta ordem — vai como backlog no relatório, não se corrige aqui.

## 2. Mapa RV-xx → arquivos (dono exclusivo por arquivo, por frente)

Arquivos tocados por mais de um RV estão marcados ⚠ — eles ditam a ordem sequencial das frentes.

| Arquivo | RV que o tocam |
|---|---|
| `src/lib/dominio.ts` | RV-02 |
| `scripts/contraste.mjs` | RV-02 |
| `src/app/globals.css` | RV-21 |
| `src/components/relatorios/barras-empilhadas.tsx` ⚠ | RV-03, RV-12b, RV-23 |
| `src/components/relatorios/grafico-mov-serie.tsx` ⚠ | RV-03, RV-05, RV-15 |
| `src/components/relatorios/barras-divergentes.tsx` ⚠ | RV-03, RV-10 |
| `src/components/relatorios/barras-horizontais.tsx` ⚠ | RV-08, RV-12a |
| `src/components/relatorios/kpi-tiles.tsx` ⚠ | RV-01a, RV-20, RV-22 |
| `src/components/relatorios/legendas.tsx` | RV-01b |
| `src/lib/relatorios/legendas.ts` | RV-01b (swatch), RV-04 (verbete foto×período) |
| `src/components/relatorios/card-relatorio.tsx` | RV-04 |
| `src/components/relatorios/chips-ancora.tsx` ⚠ | RV-13, RV-14 |
| `src/components/relatorios/grupo-colapsavel.tsx` | RV-19a |
| `src/components/relatorios/manutencao-casos.tsx` | — (só o subtítulo, que é do corpo) |
| `src/components/relatorios/tabela-itens-grupo.tsx` | RV-09 |
| `src/components/relatorios/realtime-refresh.tsx` | RV-16 |
| `src/components/relatorios/viewer-auto-refresh.tsx` | RV-16 |
| `src/components/layout/viewer-nav.tsx` | RV-17 |
| `src/components/relatorios/acesso-form.tsx` | RV-18 |
| `src/components/relatorios/corpo-relatorio-v2.tsx` ⚠⚠ | RV-04, RV-07, RV-06, RV-08, RV-11, RV-12, RV-14, RV-19b |
| **novos** `barra-acervo.tsx`, `serie-estado.tsx`, `medidor-minimo.tsx`, `chips-transferencias.tsx` | RV-07, RV-06, RV-09, RV-11 |
| `src/lib/relatorios/tipos.ts` | RV-06 (`serieEstado?`), RV-09 (`minimo?`) |
| `src/lib/queries/relatorios/estoque.ts` | RV-06 (leitura as-of semanal) |
| `src/lib/queries/relatorios/itens.ts` | RV-09 (mínimo do catálogo) |
| `src/lib/queries/relatorios/snapshot.ts` | RV-06 |
| `src/components/relatorios/confinamento-viewer.test.ts` | RV-12d |

### Módulos puros NOVOS (todos com `.test.ts` irmão — é aqui que a contagem de testes sobe)

| Módulo | Função | RV |
|---|---|---|
| `src/lib/relatorios/acervo.ts` | `agregarAcervoPorSituacao(estoqueCatStatus)` | RV-07 |
| `src/lib/relatorios/janela-card.ts` | `textoJanela(janela, periodo)` → chip "foto de dd/MM" \| "dd/MM – dd/MM" | RV-04 |
| `src/lib/relatorios/percentual.ts` | `percentualDaLista(valor, total)`, `rotuloComPercentual(...)` | RV-08 |
| `src/lib/relatorios/calendario-serie.ts` | `ehFimDeSemana(chaveISO)`, `ehBaldeDeHoje(chave, gran, hojeISO)` | RV-05 |
| `src/lib/relatorios/resumo-manutencao.ts` | `resumoRiscoManutencao(casos)` → "N casos · X em alerta (30+ dias) · Y encerrados" | RV-19b |
| `src/lib/relatorios/cliques-grafico.ts` | `urlFiltroMotivo(prefixo, motivo, search)`, `urlAtivosPorSegmento(status, categoria, filialId)`, `rotuloCliqueMotivo/Segmento` | RV-12 |
| `src/lib/relatorios/medidor-minimo.ts` | `nivelMedidor(estoque, minimo)` → `'falta'\|'limite'\|'folga'\|null`, `fracaoMedidor(...)` | RV-09 |
| `src/lib/relatorios/serie-estado.ts` | `datasDaSerieEstado(periodo, hojeISO)` (a régua dos baldes), `rotuloPontoEstado(iso)` | RV-06 |
| `src/lib/relatorios/carimbo-hora.ts` | `carimboAtualizado(ts)` → "atualizado às HH:mm" | RV-16 |
| `src/lib/relatorios/transferencias-resumo.ts` | `paresDeTransferencia(rows)` → `{de, para, total}[]` | RV-11 |
| `src/components/relatorios/relatorio-visitado.ts` | `lembrarRelatorioVisitado/lerRelatorioVisitado` (molde `ativos-recentes.ts`) | RV-17 |

## 3. Interfaces decididas (assinaturas, para não reinventar durante a edição)

```ts
// RV-04 — card-relatorio.tsx
janela?: 'foto' | 'periodo'
periodoJanela?: { de: string; ate: string }   // ISO; sem ele o chip não renderiza
// textoJanela('foto', {de,ate})    -> 'foto de 08/08'
// textoJanela('periodo', {de,ate}) -> '03/08 – 08/08'

// RV-08 — barras-horizontais.tsx
comPercentual?: boolean            // rótulo da ponta: "219 · 52%"

// RV-12 — barras-horizontais.tsx / barras-empilhadas.tsx
aoClicar?: (rotulo: string) => void          // horizontais (motivo)
aoClicarSegmento?: (status: StatusAtivo, categoria: CategoriaAtivo) => void
// Ambas OPCIONAIS: sem elas o gráfico é exatamente o de hoje (snapshot/viewer).

// RV-06 — tipos.ts
export type PontoEstado = { chave: string; rotulo: string; em_estoque: number }
export type SerieEstado = { pontos: PontoEstado[] }
// SnapshotRelatorioV2.serieEstado?: SerieEstado   ← OPCIONAL, schema segue 2

// RV-09 — tipos.ts
// SaldoItemPeriodo.minimo?: number               ← OPCIONAL
```

### Régua do RV-06 (decidida aqui, ata em DECISOES.md)

- **Pontos** = fim (domingo) de cada semana ISO **encerrada** dentro do período, das últimas **8** semanas, **+ o ponto do fim do período** (`meta.ate`) quando ele não coincidir com o último domingo.
- **Teto duro de 9 leituras as-of por render** (8 semanas + fim do período). Se a régua produzir mais, corta pelas mais recentes.
- **Mínimo de 3 pontos**; abaixo disso `serieEstado` não é gravado e o card não renderiza.
- Cada ponto guarda `rotulo` **já formatado** (`dd/MM`) — o snapshot congela o rótulo, não recalcula.
- A contagem de cada ponto é `linhas.filter(status === 'em_estoque').length` sobre o retorno de `rel_estoque_asof` — **sem** tocar nenhuma agregação existente.

### Régua do RV-09 (ata em DECISOES.md)

`nivelMedidor(estoque, minimo)`: `minimo <= 0 || minimo == null` → `null` (sem medidor);
`estoque < minimo` → `'falta'` (vermelho); `estoque - minimo <= max(2, ceil(0,2 × minimo))` → `'limite'` (âmbar); senão `'folga'` (verde).
Preenchimento = `min(estoque / minimo, 1)`.

## 4. Ordem de execução — A → B → C → D, `lint`+`test` verdes entre frentes

**Frente A (fundação, sequencial, orquestrador):** RV-02 → RV-03 → RV-01 → RV-07 → RV-21.
**Frente B (leitura):** RV-04, RV-05, RV-08, RV-10, RV-19, RV-20, RV-22, RV-23 — paralelizável em arquivos disjuntos, com `corpo-relatorio-v2.tsx` **reservado ao orquestrador**.
**Frente C (interatividade):** RV-12, RV-13, RV-14, RV-15, RV-16, RV-17, RV-18.
**Frente D (funções novas):** RV-06, RV-09, RV-11.
**Fecho:** RV-24 (roteiro de impressão P&B), docs, ajuda, revisão adversarial, push.

Regras de paralelismo (receita medida na F28, `docs/RELATORIO-F28.md` §2): dono exclusivo por arquivo declarado antes de lançar; **só `Edit`, nunca `Write`** em arquivo existente; nenhuma frente roda `git` nem `npm run build`; `corpo-relatorio-v2.tsx`, `tipos.ts` e `dominio.ts` são sempre do orquestrador.

## 5. Fora de escopo (declarado)

- Tudo do §3 da análise: donut/pizza/gauge, eixo duplo, ECharts/lib nova, export CSV do relatório, alertas/e-mail, sparkline por tile, steps dark por gráfico, a dualidade T11.
- **Zero migration, zero RPC nova** — `git diff supabase/` tem de sair vazio; `supabase db push` proibido.
- Modelo de acesso, RLS, máquina de estados, `src/lib/types/database.ts`, `src/components/ui/**`.
- Telas fora de `/relatorios/**`, exceto o efeito colateral inevitável de componentes compartilhados (`kpi-tiles.tsx` é usado pelo dashboard: RV-22 vale lá também, por ser o mesmo tile; RV-01/RV-20 não podem alterar o dashboard porque o acento depende de props que o dashboard não passa).
- A divergência de pasta da rota `relatorios/acesso` (achado 11 do §1): registrada, não corrigida.

## 6. Verificação de ponta a ponta (fim da fase)

`npm run lint` · `npx vitest run` · `npm run build` · `npm run contraste`, saídas guardadas no relatório.
Invariantes provados por comando: `git diff --stat supabase/` vazio; `git diff package.json` sem dependência; diff de `src/lib/queries/relatorios/*` só ACRESCENTA leitura (revisão linha a linha no relatório); `confinamento-viewer.test.ts` verde e cobrindo os elementos novos.
5 roteiros manuais: (1) ao vivo como operador · (2) viewer por senha · (3) snapshot novo + snapshot v1 e v2 antigos · (4) impressão A4 colorida e P&B · (5) mobile ~360px.
Revisão adversarial em contexto fresco, 5 lentes: vazamento do viewer · retrocompat de snapshot · contagens intactas · a11y/contraste dos elementos novos · cobertura dos 24 itens contra o §2 da análise.
