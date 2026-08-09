# PLAN-F30 — Onda C1: seleção múltipla, impressão completa, sidebar colapsável

Plano de execução da ordem `docs/prompts/F30-onda-c1-selecao-impressao-sidebar-ultracode.md`.
Três recursos **disjuntos** (nenhum arquivo compartilhado entre eles), cada um autossuficiente
abaixo. Nenhuma migration, nenhuma dependência nova, `supabase/` intocado.

Estado de partida (baseline medido em 09/08/2026): `npm run lint` limpo,
`npm run test` = **100 arquivos / 2131 testes** verdes.

---

## Recurso 1 · ATV-03 — Seleção múltipla na lista de ativos → movimentar em lote

### Problema
`/ativos` filtra e ordena bem, mas o lote de movimentação não nasce dali: quem separou
"notebooks em estoque da Matriz" recomeça a seleção dentro do wizard, um a um.
`buscarAtivosResumoPorIds` (`src/lib/queries/ativos.ts:624-651`) já existe e não tem quem a chame
a partir da lista; o wizard só aceita **um** id por URL (`?ativo=`).

### Arquivos e interfaces

**Novo — `src/lib/movimentacoes/lote-url.ts`** (puro, testável, sem React/Supabase):
```ts
export const SEPARADOR_IDS = ','
export type LoteDaUrl = {
  ids: string[]        // válidos, deduplicados, na ordem de chegada, cortados no teto
  invalidos: number    // pedaços que não são UUID (lixo na URL)
  repetidos: number    // ids repetidos removidos
  excedentes: number   // ids cortados pelo teto MAX_LOTE_MOVIMENTACAO
}
export function parseIdsDeAtivos(bruto: string | undefined, teto?: number): LoteDaUrl
export function avisoDoLoteInicial(p: {
  pedidos: number; encontrados: number; excedentes: number; invalidos: number
}): string | null
```
- `parseIdsDeAtivos` **filtra por regex de UUID v4-agnóstica** antes de qualquer coisa: sem isso um
  `?ativos=lixo` chega em `.in('id', …)` e o Postgres derruba a página com
  `invalid input syntax for type uuid` (armadilha real — a query não valida).
- `avisoDoLoteInicial` devolve **uma frase pt-BR** (ou `null`) somando os três motivos de
  "ficou de fora", com pluralização, no vocabulário já usado pelo corte do colar-lista
  (`colar-lista-dialog.tsx:419-430`).

**Novo — `src/lib/movimentacoes/lote-url.test.ts`**: dedupe, teto, UUID inválido, vazio,
`undefined`, ordem preservada, frases do aviso (0/1/N em cada motivo e combinações).

**Novo — `src/components/ativos/selecao-ativos.ts`** (puro, testável):
```ts
export type ResultadoSelecao = { proxima: Set<string>; entraram: number; foraPeloTeto: number }
export function alternarSelecao(atual, id, marcar, teto): ResultadoSelecao
export function marcarTodosDaPagina(atual, idsDaPagina, marcar, teto): ResultadoSelecao
export function textoCopiavel(patrimonios: (string|null)[]): { texto: string; semPatrimonio: number }
```
Motivo de ser um módulo à parte: a página pode ter 100 linhas (`TAMANHOS_PAGINA = [25,50,100]`)
e o teto do lote é 30 — "marcar todos" precisa de uma regra explícita e testada, não de um
`setState` improvisado.

**Novo — `src/components/ativos/selecao-ativos.test.ts`**.

**Alterado — `src/components/ativos/ativos-table.tsx`**:
- nova prop `escreve: boolean` (obrigatória; a página já calcula em `page.tsx:188`).
- `useReactTable` ganha `getRowId: (r) => r.id`, `state.rowSelection`, `onRowSelectionChange`,
  `enableRowSelection` — **row selection do TanStack**, como a ordem pede (o repo tem
  `useState<Set>` em `mesa-conflitos`/`fila-pendencias` porque lá **não há** TanStack).
- coluna `id: 'select'` **só quando `escreve`** (entra no `useMemo`, que passa a depender de
  `escreve` — senão a coluna congela no primeiro render):
  - cabeçalho: `<Checkbox>` com `checked={todos ? true : algum ? 'indeterminate' : false}`,
    `aria-label="Selecionar todos os ativos desta página"`.
  - linha: `<Checkbox aria-label={'Selecionar ' + (patrimonio ?? 'ativo sem patrimônio')}>`,
    dentro de uma `<TableCell>` com `onClick={e => e.stopPropagation()}` — **a linha inteira
    navega** (`ativos-table.tsx:286`), marcar não pode abrir a ficha.
  - `<TableRow data-state={selecionada ? 'selected' : undefined}>` — o `ui/table.tsx` já traz
    `data-[state=selected]:bg-muted`.
  - alvo de toque: `size-10 sm:size-7` no invólucro do checkbox (regra F29 — 40px no celular,
    espelhando o irmão no desktop).
- **barra de ação sticky** quando `escreve && selecionados > 0`, IRMÃ do
  `div.overflow-hidden` da tabela (sticky não funciona dentro de `overflow-hidden`):
  `sticky bottom-0 z-20 … border-t bg-background` + espaçador `aria-hidden h-16`,
  mecânica de `mesa-conflitos.tsx:309-342`, cores neutras (tokens existentes → o step
  `npm run contraste` do CI não vê cor nova).
  Conteúdo: "**N selecionados**" · `Movimentar` · `Copiar patrimônios` · `Limpar seleção`.
  `print:hidden` (é controle de tela).
- **Movimentar** → `router.push('/movimentacoes/nova?ativos=' + ids.join(','))`.
- **Copiar patrimônios** → um por linha, `navigator.clipboard?.writeText` com o mesmo guard +
  `try/catch` + `toast.error('Não foi possível copiar — copie manualmente.')` de
  `copiar-patrimonio.tsx:34-53` (UXG-08a).
- **Teto**: 31º recusado com `toast.warning` citando `MAX_LOTE_MOVIMENTACAO`; "marcar todos"
  marca o que couber e avisa quantos ficaram de fora.
- **Escopo por página**: `rowSelection` vive em `useState` do componente; trocar página/filtro/
  busca remonta com `rows` novos → seleção zerada. Um `useEffect` **poda** ids que sumiram da
  página (o TanStack mantém a chave selecionada mesmo sem linha correspondente, e a barra
  mentiria "5 selecionados" com 2 na tela).

**Alterado — `src/app/(app)/ativos/page.tsx`**: passa `escreve={escreve}` à tabela.

**Alterado — `src/app/(app)/movimentacoes/nova/page.tsx`**:
- `'ativos'` entra em `PARAMS_SEMEADORES` (a `key` precisa mudar quando a lista muda — F26).
- ramo novo, **antes** de `?ativo=`: `parseIdsDeAtivos(param(sp,'ativos'))` →
  `buscarAtivosResumoPorIds(ids)` → `ativosIniciais`; `avisoDoLoteInicial(...)` → prop nova.
- precedência declarada: `duplicar` > `ativos` > `ativo` > `tipo` (ata em DECISOES).

**Alterado — `src/components/movimentacoes/nova-movimentacao-form.tsx`**:
- props novas `ativosIniciais?: AtivoResumo[] | null` e `avisoLote?: string | null`.
- `const ativosDeAbertura` unifica `ativosIniciais` / `ativoInicial`; alimenta
  `useState<AtivoResumo[]>` (linha 148) e o clamp de tipo (linha 156-159, que passa a olhar
  `tiposDoLote(ativosDeAbertura.map(a => a.status))`).
- `veioDeLink` (linha 545) passa a considerar `ativosDeAbertura.length > 0` — chegar por link
  com lote não pode acordar o banner de rascunho.
- o banner âmbar (linha 1166) passa a renderizar `origemInvalida` **ou** `avisoLote`.

### Fora deste recurso
Qualquer outra ação em massa (editar/excluir/gerar termo), seleção em outras listas,
persistir seleção entre páginas (backlog), mexer na query da lista.

### Verificação de ponta a ponta
`npm run lint && npm run test`; roteiro manual: filtrar status+filial → selecionar 5 →
Movimentar → wizard com os 5 no passo 1 → registrar de verdade (dados fictícios) → conferir as
5 fichas; 31º recusado; `?ativos=` com id apagado → banner nomeando quantos; cargo consulta sem
checkbox; teclado (Tab alcança o checkbox e a barra, Espaço marca).

---

## Recurso 2 · REL-01 — O relatório impresso volta a ser arquivável

### Problema
A4 retrato ≈ viewport ~718px CSS (Chrome, margens padrão): `sm:` casa, `md:`/`lg:`/`xl:` não.
As colunas `hidden md|lg|xl:table-cell` **não saem no papel** e a `LinhaDetalhe` que as revelaria
é `print:hidden` (`linha-expansivel.tsx:80`). Grep confirma **0** `print:table-cell` no repo.

### Arquivos e interfaces

**Alterado — 6 tabelas** (42 ocorrências de `hidden <bp>:table-cell`, `th` e `td` em pares):
`tabela-saidas.tsx` (10), `tabela-entradas.tsx` (10), `tabela-transferencias.tsx` (7),
`tabela-mov-itens.tsx` (7), `tabela-movimentacoes.tsx` (6, grade v1 dos snapshots pré-F3B),
`tabela-itens-grupo.tsx` (2).
Cada coluna escondida ganha a variante de impressão que a reexibe (`print` + `table-cell`).
**Decisão única para as seis: colunas,
não `LinhaDetalhe`** — registrada em DECISOES com o motivo (a `LinhaDetalhe` é compartilhada
pelas cinco tabelas com chevron, o raio de impacto de destravá-la é maior, ela dobra a altura de
cada linha no papel e a `tabela-movimentacoes` v1 nem a tem; a compactação abaixo resolve a
largura). A coluna do chevron continua `print:hidden` **sempre** (já está).

**Alterado — `src/app/globals.css`**, dentro do `@media print` existente:
```css
/* REL-01 — compactação da impressão + contêiner que não corta */
.rel-print-compacta { font-size: 10px; }
.rel-print-compacta th, .rel-print-compacta td { padding: 2px 4px; white-space: normal; }
[data-slot='table-container'] { overflow: visible !important; }
thead { display: table-header-group; }
```
Escopo por classe (`.rel-print-compacta`, aplicada no `<Table className>` das seis tabelas), e
**nunca** um `.hidden{display:table-cell}` global — vazaria para o app inteiro.
`white-space: normal` é o que faz 11 colunas caberem: as células são `whitespace-nowrap`.

**Ordem da cascata**: `hidden` e `print:table-cell` têm a mesma especificidade (uma classe) — quem
ganha é a ordem no CSS gerado. Verificar no CSS do `npm run build` que `print:table-cell` vem
**depois** de `.hidden`; se não vier, usar o sufixo de `!important` do Tailwind v4 e registrar.
(Evite escrever variantes de classe como exemplo neste documento: o scanner do Tailwind lê
`docs/`, e uma classe citada aqui vira regra morta no CSS de produção.)

**Não regride**: `obs-tooltip.tsx:47` (REL-13a, observação completa no papel), legendas da F17
(sem `print:hidden`, saem hoje), linhas estornadas da F16, `break-before-page`/`break-inside-avoid`.
Nada muda **na tela** — todas as classes novas são de mídia print.

**Novo — `src/components/relatorios/impressao-colunas.test.ts`**: teste puro que lê os seis
arquivos-fonte com `readFileSync` e falha se existir `hidden <bp>:table-cell` **sem**
`print:table-cell` na mesma classe — a rede de regressão que hoje não existe (0 testes tocam
`print:`). Cobre também: chevron continua `print:hidden`, `LinhaDetalhe` continua `print:hidden`,
`.rel-print-compacta` presente nas seis tabelas.

### Alcance
Ao vivo, snapshot congelado e visualizador por senha usam **os mesmos componentes**
(`corpo-relatorio.tsx` → V2 com as 5 tabelas; V1 com `tabela-movimentacoes`), e as duas páginas
resolvem acesso pela mesma `resolverAcessoRelatorio()` — mudar as tabelas cobre os três.

### Fora
Paisagem forçada, `@page`, mudanças de contagem/conteúdo, mexer nas legendas, qualquer classe
que altere a tela.

### Verificação de ponta a ponta
Grep provando cobertura (0 `hidden <bp>:table-cell` de relatório sem contraparte) + o teste novo;
print preview A4 retrato (Chrome, margens padrão) nas quatro tabelas detalhadas, no ao vivo e num
snapshot. Evidência **descritiva** no relatório; nenhuma captura com dado de produção.

---

## Recurso 3 · UXG-13 — Sidebar colapsável e agrupada

### Problema
`(app)/layout.tsx:143`: `<aside … w-60 …>` fixo, sem recolher — 240px caros em 1366×768.
`sidebar-nav.tsx:34-65`: lista plana, "Administração"/"Desenvolvedor" colados em
"Relatórios"/"Ajuda" sem separador.

### Arquivos e interfaces

**Novo — `src/components/layout/sidebar-colapso.tsx`** (`'use client'`):
```ts
export const CHAVE_SIDEBAR = 'wap-sidebar'
export const SCRIPT_SIDEBAR: string      // o script inline anti-flash (string)
export function SidebarColapsoProvider({ children }): JSX.Element
export function useSidebarColapso(): { recolhida: boolean; alternar: () => void }
```
- Contexto com **default no-op** (nunca lança fora do provider).
- Estado inicial `false`; `useEffect` de montagem lê `localStorage` e sincroniza.
- `alternar()` grava `localStorage` **e** `document.documentElement.dataset.sidebar`.

**Novo — `src/components/layout/sidebar-colapso.test.ts`**: funções puras
`leituraDoStorage(valor)` / `valorParaStorage(recolhida)` / `proximoEstado`, e a garantia de que
o script inline contém a chave e não referencia nada fora de `window`/`localStorage`.

**Novo — `src/components/layout/sidebar-lateral.tsx`** (`'use client'`): renderiza o `<aside>`
(que sai do Server Component), aplica `w-60` ↔ `w-16` conforme o contexto, marca
`data-sidebar-lateral`, e monta `SidebarNav` + o **botão de recolher** no pé:
`aria-expanded={!recolhida}`, `aria-controls="sidebar-nav"`,
`aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}`,
ícone `PanelLeftClose`/`PanelLeftOpen` (lucide-react, já na stack), alvo `size-10 sm:size-8`.

**Alterado — `src/components/layout/sidebar-nav.tsx`**:
- `NavItem` ganha `separadorAntes?: boolean` — `true` em **Administração** e em **Ajuda**.
  Render: `border-t pt-1 mt-1` no item, **nunca no primeiro** da lista já filtrada (guarda
  `indice > 0`) — o cargo consulta não pode ver divisor órfão.
- props novas `colapsada?: boolean` e `id?: string`.
- colapsada: item vira ícone centralizado, rótulo dentro de `<span data-sidebar-rotulo>`, o
  `<Badge>` de pendências vira um selo absoluto sobre o ícone (continua visível — requisito),
  e cada item é embrulhado em `Tooltip`/`TooltipTrigger asChild`/`TooltipContent side="right"`
  (o `TooltipProvider` já existe no layout, `delayDuration={300}`).
- **mobile não muda**: o Sheet do `app-header.tsx` monta a MESMA `SidebarNav` **sem**
  `colapsada` → sempre expandida.

**Alterado — `src/app/(app)/layout.tsx`**: `<SidebarColapsoProvider>` logo dentro do
`TooltipProvider` (envolve `AtalhosGlobais` **e** a sidebar); `<script>` inline anti-flash antes
do shell; `<aside>` substituído por `<SidebarLateral …>`.

**Alterado — `src/app/globals.css`** (fora do `@media print`), o espelho pré-hidratação do que o
React aplica depois — especificidade `(0,3,0)` ganha das utilitárias `(0,1,0)`:
```css
:root[data-sidebar='recolhida'] [data-sidebar-lateral] { width: 4rem; }
:root[data-sidebar='recolhida'] [data-sidebar-rotulo] { display: none; }
:root[data-sidebar='recolhida'] [data-sidebar-item] { justify-content: center; }
```
`<html suppressHydrationWarning>` já existe (`src/app/layout.tsx:37`) — é o que absorve o
atributo escrito pelo script, exatamente como o next-themes faz com a classe do tema.

**Alterado — `src/components/movimentacoes/atalho-global.tsx`**: tecla `[` chama
`alternar()` do contexto, **depois** das guardas `editando()`/`modalAberto()`/`repeat`/modificadores
que já existem — os atalhos globais continuam todos num arquivo só.

**Alterado — `src/components/layout/atalhos-dialog.tsx`**: linha nova `[` no quadro do `?`.

**Alterado — ajuda (F20)**: `limites-e-atalhos.ts` (bloco `atalhos` ganha a linha `[`),
`mapa-das-telas.ts` (seção `teclado`: "três" → "quatro"), e
`referencia.test.ts:326,330` ganha `'['` na lista de teclas cobradas.

### Fora
Reordenar/esconder itens, redesenhar o header, tocar `viewer-nav.tsx` (é outro componente — a nav
horizontal do visualizador por senha), mudar o Sheet mobile.

### Verificação de ponta a ponta
Recolher → navegar por 4 telas → recarregar (preferência mantida) → expandir; tooltip por teclado
(Tab foca o item, tooltip aparece); `[` com e sem campo focado e com modal aberto; selo de
pendências visível recolhida; recarregar já recolhida **sem** salto de layout.

---

## Housekeeping e encerramento

- `docs/prompts/F30-…md` commitado (a F31 não existe no ambiente — registrar).
- `package-lock.json` chega sujo (npm no Windows removendo campos `libc`) — **sujeira alheia,
  não tocar**, registrar como pendência.
- Ao final: `npm run lint`, `npm run test`, `npm run build` limpos, contagem de testes **acima**
  de 2131; `CHANGELOG.md` (topo), `README.md` (status F30), `docs/DECISOES.md` (mínimo três atas:
  escopo por página da seleção, teto no `?ativos=`, print-colunas × print-LinhaDetalhe),
  `docs/RELATORIO-F30.md`; `git pull --rebase` e push na `main`.
