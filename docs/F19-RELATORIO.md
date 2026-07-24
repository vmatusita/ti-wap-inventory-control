# Relatório F19-UX — Correções da revisão de UX/UI + modo escuro

**OS `docs/prompts/F19-correcoes-ux-dark-mode.md` (ultracode) · 24/07/2026 · direto na `main`.**
Aplicação dos 4 achados P1 e dos 8 polimentos P2 da revisão de UX/UI de 24/07, mais o modo escuro
ligado como **opt-in**. 100% camada de UI/client — **zero migration, zero dependência nova**.

> **Colisão de nome:** já existe uma fase F19 (auditoria de regras de negócio) com relatório em
> [`docs/RELATORIO-F19.md`](RELATORIO-F19.md). Esta ordem é outra, entregue no mesmo dia, e o nome
> deste arquivo (`F19-RELATORIO.md`) foi escolhido pela própria ordem — nada foi sobrescrito.

## Sumário executivo

| Métrica | Baseline (`37774eb`) | Depois | |
|---|---|---|---|
| `npm run lint` | limpo | **limpo** | ✅ |
| `npm run build` | 24 rotas, 0 erro | **24 rotas, 0 erro** | ✅ |
| `npx vitest run` | 56 arquivos / **1092** testes | 58 arquivos / **1119** testes | ✅ +27 |
| Chamadas client de action sem `catch` | **28** | **0** | ✅ |
| `<Label>` de Select sem nome acessível | **12** | **0** | ✅ |
| Cores claras fixas sem par `dark:` | **21** | **0** | ✅ |
| Smoke (rotas, tema, impressão, console) | — | **28 checagens, 0 falha** — inclui o passo LOGADO | ✅ |
| Migrations | 0 | **0** | — |
| Dependências novas | 0 | **0** | — |

**Veredito:** entregue por inteiro. O tema claro continua sendo o padrão — quem nunca tocar no
toggle não vê diferença nenhuma. Empurrado para `origin/main` com todos os critérios verdes. O smoke **logado** rodou depois, com o `.env.smoke` que o Johnny criou, e o par de contraste que ficara no backlog foi fechado (§3) — os dois numa segunda leva de commits.

---

## 1. Checklist item a item (autoverificado)

### P1 — os 4 achados sistêmicos

| # | Achado | Estado | Prova |
|---|---|---|---|
| **P1-1** | Rede muda em mutação | ✅ | 28 pontos em 22 arquivos ganharam `try/catch`; varredura de verificação zerada |
| **P1-2** | Select sem nome acessível | ✅ | 12 pares `htmlFor`/`id`; varredura independente sem sobra |
| **P1-3** | Δ dos KPIs reprova contraste | ✅ | `text-green-600` → `text-green-700`: **3,22 → 4,94:1** (§3) |
| **P1-4** | Toasts seguindo o tema do SO | ✅ | `<Toaster/>` dentro do `ThemeProvider`; `ui/sonner.tsx` **não** foi tocado |

**P1-1 em detalhe.** O defeito não era erro de negócio (esse já era bem tratado por
`traduzErroBanco`), era **transporte**: rede caindo, 413/payload, falha de serialização do RSC,
sessão morta no meio do request. Dentro de `startTransition` a rejeição subia até o error boundary e
**apagava a tela**; num handler `async` chamado por `onClick` sem `await`, virava *unhandled
rejection* — nada acontecia e o operador clicava de novo sem saber se a escrita passou.

A exploração achou **6 pontos além dos 16 listados na ordem** (mesma classe de defeito): três
diálogos com `startTransition` (`criar-senha-dialog`, `item-combobox`, `historico-lancamentos`) e
três handlers com `try/finally` sem `catch` (`nova-compra-form`, `colar-lista-dialog`,
`gerar-termo-dialog`). Todos entraram.

**O sétimo ponto extra só apareceu na revisão adversarial** (§6) e vale como lição: a varredura
inicial procurou `startTransition`/`useTransition` e `try/finally`, e por isso passou reto por
`editar-ativo-dialog.tsx` — o **único** ponto de escrita do app cujo `await` é chamado pelo
`handleSubmit` do react-hook-form, sem transition nenhuma. A varredura final foi refeita por outro
critério (todo `await <ação importada de @/lib/actions/>` em Client Component, com ou sem
transition) e **voltou zerada**.

> ⚠️ Não confundir com o desvio de P1-2 logo abaixo: `editar-ativo-dialog` **já estava correto**
> quanto ao nome acessível do `<Select>` (o `FormControl` injeta `htmlFor`/`id`) **e** estava
> **faltando** o `try/catch`. As duas coisas são verdadeiras e independentes.

Três cuidados que valem registro:

- **Ações destrutivas afirmam o não-efeito** — "nada foi estornado", "a senha continua ativa",
  "nada foi excluído" — para o operador não repetir por garantia. *Ressalva honesta:* um throw pode
  ocorrer **depois** de o servidor ter commitado (resposta perdida na volta). A frase é a leitura
  correta na esmagadora maioria dos casos, e o efeito real continua visível na linha do tempo.
- **O lote não se perde.** Em `registrar()` a mensagem é
  `"Não foi possível registrar agora. Seu lote continua aqui — verifique sua conexão e tente de novo."`
  O `return` dentro do `catch` é obrigatório: sem ele o código seguinte leria `res` indefinido.
- **Leituras por digitação degradam caladas** (combobox, sugestões, paleta). Um toast por tecla
  seria pior que o silêncio; o `catch` ali existe só para não deixar *unhandled rejection*.

**P1-2 — dois desvios da ordem, por engano dela** (ambos registrados em `DECISOES.md`):

- `gerar-relatorio-dialog.tsx` "Escopo" **não é um Select** — rotula dois `<Button>` de alternância.
  `htmlFor` apontaria para um único controle e seria enganoso. Aplicado `role="group"` +
  `aria-labelledby`, o padrão que `motivo-dialog` e `kit-dialog` já usam.
- `editar-ativo-dialog.tsx` **já estava correto**: usa `<FormLabel>`+`<FormControl>`, e
  `ui/form.tsx` injeta `htmlFor`/`id` via `Slot`. Pôr `id` à mão **quebraria** a injeção.
  Não foi tocado.

### Modo escuro

| Item | Estado | Prova |
|---|---|---|
| `ThemeProvider` no root layout | ✅ | `attribute="class"`, `defaultTheme="light"`, `enableSystem`, `disableTransitionOnChange` |
| `suppressHydrationWarning` no `<html>` | ✅ | `src/app/layout.tsx` |
| Toggle Claro/Escuro/Sistema no menu do usuário | ✅ | `DropdownMenuRadioGroup` com ícones; marcação por **✓**, não só cor |
| Padrão continua CLARO | ✅ | smoke §2: sem `localStorage`, `class` sai `light` |
| Escolha persiste entre reloads | ✅ | smoke §2 |
| "Sistema" segue o SO | ✅ | smoke §2, nos dois sentidos (`emulateMedia`) |
| Sem flash de tema errado | ✅ | smoke §3: a classe já está no `<html>` no `DOMContentLoaded` |
| Toasts seguem o tema do app | ✅ | `<Toaster/>` dentro do provider (P1-4) |
| Viewer por senha **sem** toggle | ✅ | `UserMenu` só é montado em `app-header.tsx`; o viewer usa `viewer-header.tsx` |
| Chrome da marca preservado | ✅ | `bg-brand-dark`/`bg-brand-amarelo` intocados (ver screenshot escuro) |
| Varredura de pares `dark:` faltantes | ✅ | 21 achados, todos corrigidos |
| **Impressão sempre clara** | ✅ | smoke §4 — prova completa abaixo |
| Gráficos legíveis nos dois temas | ✅ | P2-7 (§3): as cores são hex fixos, o veredito vale igual nos dois |

**A impressão clara, e por que a solução é de duas linhas.** O `@media print` já forçava
`body { background:#fff }`, mas com `.dark` no `<html>` o `--foreground` fica quase branco e o
`--border` quase transparente: sairia **texto branco em papel branco** e cards sem moldura. Pior, o
variant compilava para `&:is(.dark *)` e continuava casando ao imprimir — badges e pílulas sairiam
com texto claro no papel.

Em vez de duplicar os 38 tokens claros dentro do `@media print`, ou salpicar variantes `print:`, ou
pendurar um listener de `beforeprint` em JS, a solução foi **desligar** o escuro na mídia print:

```css
@custom-variant dark {
  @media not print { &:is(.dark *) { @slot; } }
}

@media not print {
  .dark { /* …os 38 tokens escuros… */ }
}
```

Na impressão o bloco `.dark` **não declara token nenhum** e tudo cai no `:root` claro por cascata
(`.dark` é o MESMO `<html>` do `:root`, mesma especificidade), e **nenhum** utilitário `dark:` chega
a casar. Zero duplicação de paleta, zero JS, zero flash — e cobre 100% dos `dark:`, inclusive os de
componentes que ainda nem existem. Conferido no **CSS compilado**: todos os `.dark\:*` são emitidos
dentro de `@media not print`.

### P2 — os polimentos

| # | Item | Estado | Onde |
|---|---|---|---|
| **5** | Estado vazio de `/ativos` com `EstadoVazio` + `temFiltro` | ✅ | `src/app/(app)/ativos/page.tsx` |
| **6** | `role="alert"` nos 2 boxes + erro inline no login | ✅ | `nova-movimentacao-form`, `nova/passo-movimentacao`, `login/page` |
| **7** | Rótulo do gráfico por luminância, 10 → 11px | ✅ | `barras-empilhadas` + `lib/relatorios/rotulo-grafico.ts` (novo, testado) |
| **8** | Fallback das pílulas + chip "em breve" 10 → 11px | ✅ | `lib/dominio.ts`, `layout/sidebar-nav.tsx` |
| **9** | `aria-label="Etapas"` + `aria-current="step"` | ✅ | `nova-movimentacao-form.tsx` |
| **10** | `title=` → Tooltip em 4 pontos | ✅ | `saldos-filiais` (2), `badge-repor`, `celulas` — via `ui/dica.tsx` |
| **11** | `prefers-reduced-motion` | ✅ | barra de progresso + 5 `animate-spin` |
| **12a** | "Voltar" preservando os filtros | ✅ | `ativos/voltar-para-ativos.tsx` (novo) |
| **12b** | Ações de exceção num menu `⋯` | ✅ | `ativos/acoes-excecao-ficha.tsx` (novo) |
| **12c** | Destaque `:target` na âncora `#mov-…` | ✅ | `ativos/linha-do-tempo.tsx` |

Três armadilhas que a exploração pegou antes de virarem defeito:

- **`temFiltro` de `/ativos`:** `status` é **array** — `Boolean([])` é `true` e teria quebrado a
  distinção inteira. E "nada cadastrado" exige `resultado.total === 0` além de `!temFiltro`, senão
  `?page=9` sem filtro cairia no texto errado.
- **`ui/dica.tsx` é client MÍNIMO de propósito:** os três consumidores (`saldos-filiais`,
  `badge-repor`, `celulas`) são Server Components e precisavam continuar sendo. Pôr `'use client'`
  neles arrastaria as tabelas inteiras para o cliente. Mesmo formato do `relatorios/obs-tooltip.tsx`,
  que já era o precedente.
- **O menu `⋯`:** os dois diálogos tinham `open` em `useState` privado e gatilho acoplado — não
  havia como abri-los de fora. Ganharam `open`/`onOpenChange` **opcionais** (controlado quando vêm,
  não-controlado quando não vêm), com a limpeza do campo rodando nos dois modos. Os diálogos são
  **irmãos** do menu (dentro do `DropdownMenuContent` o Radix os desmontaria ao fechar) e o
  `onSelect` faz `preventDefault()` — sem isso o menu devolve o foco no mesmo tick em que o diálogo
  tenta capturá-lo, e vem o clássico diálogo sem foco / `<body>` preso em `pointer-events: none`.

**O "Voltar" (12a) NÃO usa `document.referrer` — e esse é o achado mais instrutivo da ordem.**
A ordem prescrevia "`history.back()` quando o referrer é a própria lista". Foi implementado assim,
e a revisão adversarial provou que **não funcionaria**: no App Router a navegação da lista para a
ficha é **soft** (`history.pushState`), e `pushState` **não atualiza** `document.referrer`. No fluxo
real a checagem daria `false`, o `back()` nunca dispararia, e o link se comportaria exatamente como
o `<Link href="/ativos">` fixo de antes — **em silêncio, parecendo entregue**.

O sinal foi trocado, mantendo o objetivo: a própria lista grava sua URL completa em `sessionStorage`
(`LembrarLista`, um `return null`), e o link da ficha a lê **no clique** (nunca no render, que
quebraria a hidratação) e faz `router.push`. Determinístico — não depende de quantas fichas o
operador abriu no caminho — e sem o "clique morto" que o `back()` daria na entrada mais antiga do
histórico. O `href="/ativos"` real continua embaixo: sem JS, "abrir em nova aba" e clique do meio
seguem funcionando.

**Segurança:** o valor lido do storage passa por `ehUrlDaListaDeAtivos` antes de virar destino — só
caminho relativo cujo pathname é **exatamente** `/ativos`, barrando `//host`, `https://`,
`javascript:` e as próprias fichas `/ativos/<id>`. Travado por **6 testes**
(`lista-visitada.test.ts`). A re-revisão tentou furar com **30 entradas** (incluindo `%2f%2fevil`,
`\t/ativos`, `/ativos\\evil`, `/ATIVOS`, `/ativos#/x`) e **nenhuma passou** — o
`split('?')[0] === '/ativos'` é fail-closed.

**Comportamento a saber (é desenho, não defeito):** a memória é da **última lista visitada na aba**,
não de "de onde eu vim". Se o operador filtrar `/ativos`, sair para `/pendencias` e abrir uma ficha
por lá, o "Voltar para ativos" o leva à lista filtrada anterior — que pode não conter aquele ativo.
O desenho por referrer levaria à lista limpa nesse caso, mas não funcionava em caso nenhum. Fica
registrado para o Johnny decidir se algum dia incomoda.

**O que não volta:** a posição de scroll (o `back()` restauraria; o `push` não). Nem o `PLAN.md` nem
a ordem prometiam scroll — o requisito é o filtro, e esse volta inteiro, com ordenação e página.

---

## 2. Decisões registradas

Todas em [`docs/DECISOES.md`](DECISOES.md), entrada **2026-07-24 · F19-UX**:

1. **Revogação** da decisão de 21/07 ("app é tema claro por design"). A premissa dela estava errada
   — dizia que o toggle "exigiria `next-themes` (fora da stack fechada)", quando a dependência **já
   estava** no `package.json`. Em consequência, o item **T12 do backlog** ("remover `next-themes`,
   dependência morta") foi retirado de `docs/BACKLOG-UX.md` e do `README.md`.
2. **`try/catch` inline, sem helper** — convivem **seis** formatos de retorno e vários sítios checam
   campos além do `ok` (`!res.ok || !res.id`); um helper genérico viraria `unknown` + casts e
   forçaria uma mensagem única onde cada botão precisa da sua.
3. **Impressão clara em CSS puro** (as duas linhas acima), com as alternativas descartadas e o porquê.
4. **Viewer por senha sem toggle** — sai de graça pela arquitetura, sem código para excluí-lo.
5. **Exceção em `ui/dialog.tsx` e `ui/sheet.tsx`** — o scrim `bg-black/10` some sobre fundo quase
   preto; ligar o tema **criaria** o defeito. `dark:bg-black/50` nos dois, e nada mais.
   `ui/sonner.tsx` **não** foi tocado, como a ordem pediu.
6. **Os dois desvios de P1-2** (Escopo não é Select; editar-ativo já correto).
7. **Destaque `:target` sem JS** e **rótulo do gráfico por luminância, com teste**.

---

## 3. Contrastes — antes → depois, nos dois temas

Medidos por `node scripts/contraste.mjs` (Node puro, zero dependência). O script lê a paleta **real**
do Tailwind v4 (`node_modules/tailwindcss/theme.css`) e os tokens do app (`globals.css`), ambos em
oklch — nada hard-coded. **Ele se valida sozinho:** reproduz exatamente os quatro números que a
revisão de 24/07 apurou à mão (3,22 · 4,34 · 6,11 · 2,54).

<!-- SAÍDA REAL de `node scripts/contraste.mjs` -->

| Item | Par | Tema | Texto | Fundo | Razão | Exigido | Veredito |
|---|---|---|---|---|---:|---:|---|
| P1-3 | Δ KPI verde — ANTES | claro | `green-600` | `card` | 3.22:1 | 4.5:1 | ❌ reprova |
| P1-3 | Δ KPI verde — DEPOIS | claro | `green-700` | `card` | 4.94:1 | 4.5:1 | ✅ AA |
| P1-3 | Δ KPI verde escuro (inalterado) | escuro | `green-400` | `card` | 10.09:1 | 4.5:1 | ✅ AAA |
| P1-3 | Δ KPI vermelho (referência) | claro | `red-600` | `card` | 4.76:1 | 4.5:1 | ✅ AA |
| P1-3 | Δ KPI vermelho escuro (referência) | escuro | `red-400` | `card` | 6.19:1 | 4.5:1 | ✅ AA |
| P2-8 | pílula fallback — ANTES | claro | `muted-foreground` | `muted` | 4.34:1 | 4.5:1 | ❌ reprova |
| P2-8 | pílula fallback — DEPOIS | claro | `gray-600` | `gray-200` | 6.11:1 | 4.5:1 | ✅ AA |
| P2-8 | pílula fallback — DEPOIS (escuro) | escuro | `gray-400` | `gray-800` | 5.64:1 | 4.5:1 | ✅ AA |
| dark: | pílula Saída (claro, inalterado) | claro | `amber-800` | `amber-100` | 6.41:1 | 4.5:1 | ✅ AA |
| dark: | pílula Saída (escuro, NOVO) | escuro | `amber-300` | `amber-950` | 10.37:1 | 4.5:1 | ✅ AAA |
| dark: | pílula Devolução (claro, inalterado) | claro | `blue-700` | `blue-100` | 5.59:1 | 4.5:1 | ✅ AA |
| dark: | pílula Devolução (escuro, NOVO) | escuro | `blue-300` | `blue-950` | 8.13:1 | 4.5:1 | ✅ AAA |
| verde | badge/pílula verde — ANTES | claro | `green-700` | `green-100` | 4.50:1 | 4.5:1 | ❌ reprova |
| verde | badge/pílula verde — DEPOIS | claro | `green-800` | `green-100` | 6.45:1 | 4.5:1 | ✅ AA |
| verde | badge/pílula verde — escuro (inalterado) | escuro | `green-300` | `green-950` | 10.67:1 | 4.5:1 | ✅ AAA |
| família | Reservado (violeta) | claro | `violet-700` | `violet-100` | 6.13:1 | 4.5:1 | ✅ AA |
| família | Em uso (azul) | claro | `blue-700` | `blue-100` | 5.59:1 | 4.5:1 | ✅ AA |
| família | Emprestado (ciano) | claro | `cyan-700` | `cyan-100` | 4.71:1 | 4.5:1 | ✅ AA |
| família | Em triagem (laranja) | claro | `orange-700` | `orange-100` | 4.56:1 | 4.5:1 | ✅ AA |
| família | Em manutenção (âmbar) | claro | `amber-800` | `amber-100` | 6.41:1 | 4.5:1 | ✅ AA |
| família | Descartado (cinza) | claro | `gray-600` | `gray-200` | 6.11:1 | 4.5:1 | ✅ AA |
| família | Devolvido ao fornecedor (slate) | claro | `slate-700` | `slate-200` | 8.40:1 | 4.5:1 | ✅ AAA |
| família | Troca (teal) | claro | `teal-700` | `teal-100` | 4.79:1 | 4.5:1 | ✅ AA |
| dark: | pílula Compra (escuro, NOVO) | escuro | `green-300` | `green-950` | 10.67:1 | 4.5:1 | ✅ AAA |
| dark: | badge Ativo admin (escuro, NOVO) | escuro | `green-300` | `green-950` | 10.67:1 | 4.5:1 | ✅ AAA |
| dark: | pendência dashboard (claro, inalterado) | claro | `amber-800` | `card` | 7.13:1 | 4.5:1 | ✅ AAA |
| dark: | pendência dashboard (escuro, NOVO) | escuro | `amber-300` | `card` | 12.39:1 | 4.5:1 | ✅ AAA |
| dark: | callout âmbar (claro, inalterado) | claro | `amber-900` | `amber-50` | 8.77:1 | 4.5:1 | ✅ AAA |
| dark: | callout âmbar (escuro, NOVO) | escuro | `amber-200` | `amber-950/40` | 13.65:1 | 4.5:1 | ✅ AAA |
| P2-7 | rótulo Em estoque — ANTES (branco) | claro | `white` | `#16a34a` | 3.30:1 | 4.5:1 | ❌ reprova |
| P2-7 | rótulo Em estoque — DEPOIS (preto) | claro | `black` | `#16a34a` | 6.37:1 | 4.5:1 | ✅ AA |
| P2-7 | rótulo Reservado — ANTES (branco) | claro | `white` | `#7c3aed` | 5.70:1 | 4.5:1 | ✅ AA |
| P2-7 | rótulo Reservado — DEPOIS (branco, mantido) | claro | `white` | `#7c3aed` | 5.70:1 | 4.5:1 | ✅ AA |
| P2-7 | rótulo Em uso — ANTES (branco) | claro | `white` | `#2a78d6` | 4.42:1 | 4.5:1 | ❌ reprova |
| P2-7 | rótulo Em uso — DEPOIS (preto) | claro | `black` | `#2a78d6` | 4.76:1 | 4.5:1 | ✅ AA |
| P2-7 | rótulo Emprestado — ANTES (branco) | claro | `white` | `#0891b2` | 3.68:1 | 4.5:1 | ❌ reprova |
| P2-7 | rótulo Emprestado — DEPOIS (preto) | claro | `black` | `#0891b2` | 5.70:1 | 4.5:1 | ✅ AA |
| P2-7 | rótulo Em triagem — ANTES (branco) | claro | `white` | `#ea580c` | 3.56:1 | 4.5:1 | ❌ reprova |
| P2-7 | rótulo Em triagem — DEPOIS (preto) | claro | `black` | `#ea580c` | 5.90:1 | 4.5:1 | ✅ AA |
| P2-7 | rótulo Em manutenção — ANTES (branco) | claro | `white` | `#d97706` | 3.19:1 | 4.5:1 | ❌ reprova |
| P2-7 | rótulo Em manutenção — DEPOIS (preto) | claro | `black` | `#d97706` | 6.59:1 | 4.5:1 | ✅ AA |
| P2-7 | rótulo Defasado — ANTES (branco) | claro | `white` | `#9ca3af` | 2.54:1 | 4.5:1 | ❌ reprova |
| P2-7 | rótulo Defasado — DEPOIS (preto) | claro | `black` | `#9ca3af` | 8.27:1 | 4.5:1 | ✅ AAA |
| P2-12c | anel :target — ANTES (amber-400) | claro | `amber-400` | `card` | 1.72:1 | 3:1 | ❌ reprova |
| P2-12c | anel :target — DEPOIS (token warning) | claro | `warning` | `card` | 5.65:1 | 3:1 | ✅ AA |
| P2-12c | anel :target — DEPOIS (escuro) | escuro | `warning` | `card` | 9.47:1 | 3:1 | ✅ AAA |
| marca | azul WAP sobre card escuro | escuro | `#2a78d6` | `card` | 4.06:1 | 3:1 | ✅ AA |
| marca | amarelo WAP sobre card escuro | escuro | `#eda100` | `card` | 8.27:1 | 3:1 | ✅ AAA |

### O par verde — achado do medidor, e agora fechado

`text-green-700` sobre `bg-green-100` media **4,4996:1** — reprovava AA por **0,0004**. Era par
**pré-existente** (não introduzido pela F19), em **12 pontos de 10 arquivos**: `STATUS_META.em_estoque`,
`TIPO_PILL.compra`, `TIPO_LANC_PILL.liberacao`, os 5 badges "Ativo/Ativa" do admin, os 3 círculos de
ícone de sucesso e a pílula "voltou" de manutenção. Ficou registrado como backlog no primeiro fecho e
foi **corrigido a pedido do Johnny**: `text-green-800`, **6,45:1**.

Antes de trocar, medi a **família inteira** para não sair mexendo em tinta sem necessidade — e só o
verde reprovava (violeta 6,13 · azul 5,59 · teal 4,79 · ciano 4,71 · laranja 4,56 · âmbar 6,41 ·
cinza 6,11 · slate 8,40). Por isso **só o verde** desceu um degrau; os irmãos ficaram como estavam.
Não é inconsistência de paleta: é o alvo de contraste que cada matiz exige com a mesma tinta. O
comentário em `dominio.ts` explica isso no lugar em que alguém iria "consertar" a divergência.

Conferi também os `text-green-700` sobre **outros** fundos, que não entram nessa troca porque passam:
sobre `green-50` (callout do import) **4,72:1** e sobre o card (painel de sucesso, Δ dos KPIs)
**4,94:1**. E o swatch de `legendas.ts` só tem fundo, sem texto.


---

## 4. Saídas reais dos comandos

### `npm run lint`

```
$ npm run lint

> estoque-ti-wap@0.1.0 lint
> eslint

(exit 0)
```

### `npx vitest run`

```
$ npx vitest run
 RUN  v4.1.10 C:/Users/yukig/ti-wap-inventory-control


 Test Files  57 passed (57)
      Tests  1113 passed (1113)
   Start at  19:26:35
   Duration  16.37s (transform 2.50s, setup 0ms, import 139.97s, tests 1.98s, environment 6ms)
```

Baseline eram **56 arquivos / 1092 testes**. Os **+21** vêm de
`src/lib/relatorios/rotulo-grafico.test.ts` (novo): travam a fórmula de luminância WCAG, o veredito
de cor para os 7 status, e um teste que **lê `src/app/globals.css`** e quebra se `--brand-azul`
mudar sem a constante do módulo acompanhar.

### `npm run build`

```
▲ Next.js 16.2.10 (Turbopack)
- Environments: .env.local

  Creating an optimized production build ...
✓ Compiled successfully in 4.9s
  Running TypeScript ...
  Finished TypeScript in 16.6s ...
  Collecting page data using 11 workers ...
✓ Generating static pages using 11 workers (24/24) in 1200ms
  Finalizing page optimization ...

Route (app)                          24 rotas, todas sem erro
ƒ Proxy (Middleware)
```

---

## 5. Smoke — evidências

`node scripts/smoke-f19.mjs` contra `npm run build && npm run start`. **100% leitura** — o ambiente
desta máquina aponta para **produção** (ver `DECISOES.md`), então o script não submete formulário
nenhum e não escreve nada no banco. Playwright roda **avulso**: o script o resolve do cache do `npx`,
sem entrar no `package.json`.

```
=== SMOKE F19 · http://localhost:3000 ===

[1] Rotas públicas respondem 200
  OK   /login → 200
  OK   /relatorios/acesso → 200

[2] Tema: a classe entra e sai do <html>, e o token acompanha
  OK   padrão de fábrica é CLARO (class="… light")
  OK   tema Escuro aplica a classe (class="… dark")
  OK   o fundo do body MUDOU (lab(100 0 0) → lab(2.75381 0 0))
  OK   tema Claro remove a classe
  OK   o fundo volta ao valor do tema claro
  OK   Sistema + SO escuro → classe dark
  OK   Sistema + SO claro → sem classe dark

[3] Sem flash de tema errado (o script do next-themes roda antes da pintura)
  OK   a classe já está no <html> no DOMContentLoaded (class="… dark")

[4] Impressão sai CLARA mesmo com o tema escuro ativo
  OK   na TELA, com tema escuro, os tokens são os escuros (controle do teste)
  OK   na TELA a variante dark: APLICA (probe = lab(15.6845 -20.4225 11.7249))
  OK   a classe .dark CONTINUA no <html> (o tema da TELA não é desfeito)
  OK   --background imprime com o valor CLARO (lab(100% 0 0))
  OK   --foreground imprime com o valor CLARO (lab(2.75381% 0 0))
  OK   --card imprime com o valor CLARO (lab(100% 0 0))
  OK   --card-foreground imprime com o valor CLARO (lab(2.75381% 0 0))
  OK   --border imprime com o valor CLARO (lab(90.952% -.0000596046 0))
  OK   --muted-foreground imprime com o valor CLARO (lab(48.496% 0 0))
  OK   na IMPRESSÃO nenhuma variante dark: casa (probe = rgba(0, 0, 0, 0))

[5] Telas logadas
  OK   login concluído → /
  OK   / (light) → 200
  OK   /ativos (light) → 200
  OK   /movimentacoes/nova (light) → 200
  OK   / (dark) → 200
  OK   /ativos (dark) → 200
  OK   /movimentacoes/nova (dark) → 200

[6] Console do navegador
  OK   sem erro de console (0 relevante(s))

=== RESULTADO: TUDO OK ===
Evidências públicas em docs/f19-evidencias/
Evidências das telas LOGADAS (fora do repo, têm dado real): C:\Users\yukig\AppData\Local\Temp\smoke-f19-logado
```

**O passo [4] é a prova completa da impressão clara**, e tem os dois lados: com `.dark` ainda no
`<html>`, os 6 tokens voltam ao valor do tema **claro** *e* um probe real `dark:bg-green-950` deixa
de casar (fica transparente). O controle do teste — a mesma medição **na tela** — mostra o oposto, o
que descarta a hipótese de o teste estar medindo nada.

### Screenshots

| Arquivo | O que mostra |
|---|---|
| `docs/f19-evidencias/login-claro.png` | tema claro (padrão de fábrica) |
| `docs/f19-evidencias/login-escuro.png` | tema escuro — note o lockup da marca **preservado** (amarelo sobre escuro) |
| `docs/f19-evidencias/login-impressao-com-tema-escuro.png` | mídia `print` emulada **com o tema escuro ativo** — sai claro |

> **Por que não há screenshot de tela logada aqui.** Regra 2 do CLAUDE.md: nada de patrimônio real,
> nome de colaborador real ou linha das planilhas em screenshot — e o `.env.local` desta máquina
> aponta para **produção**, então o dashboard traz tudo isso na tela. Na primeira execução do smoke
> logado os 6 PNGs foram gravados em `docs/f19-evidencias/` por descuido meu; foram **apagados
> antes de qualquer commit** (conferido: nunca entraram no índice do git — só os 3 de login, que
> mostram formulário vazio, estão versionados). O script agora grava as telas logadas no **temp do
> sistema operacional**, fora do alcance de `git add`, e diz o caminho ao final. Quem rodar o smoke
> vê as imagens; o repositório não.

---

## 6. Revisão adversarial (contexto fresco, 4 lentes)

Ao final, quatro agentes que **não participaram da implementação** revisaram o diff completo contra
o `PLAN.md` e os critérios de aceitação, cada um por uma lente: **cobertura do plano**, **tema e
impressão**, **regressão client/server** e **acessibilidade e contraste**. Instrução explícita de
serem adversariais mas verificáveis (só relatar o que sustentassem com arquivo+linha do código
atual). Achados, deduplicados:

| Gravidade | Achado | Desfecho |
|---|---|---|
| **alta** | `editar-ativo-dialog.tsx` sem `try/catch` — o P1-1 **não** estava cumprido ali | ✅ **Corrigido.** Era o único ponto de escrita chamado pelo `handleSubmit` do react-hook-form, sem `startTransition` — por isso escapou da varredura inicial. Varredura refeita por outro critério: **zerada**. |
| **média** | "Voltar para ativos" não funcionaria: `document.referrer` não muda em navegação soft | ✅ **Corrigido.** Sinal trocado para `sessionStorage` (§1). O achado mais valioso — o item parecia entregue e não estava. |
| **média** | Anel do destaque `:target` a **1,72:1** no tema claro — invisível justamente no padrão | ✅ **Corrigido.** `ring-amber-400` → token semântico `ring-warning`: **5,65:1** claro, **9,47:1** escuro, e clareia sozinho (dispensa `dark:`). Melhor que o `amber-600` sugerido pela revisão (3,19:1). |
| **média** | `CHANGELOG.md` sem entrada da F19-UX | ✅ **Feito.** |
| **média** | `docs/F19-RELATORIO.md` inexistente | ✅ **Feito** (este arquivo). Os agentes começaram antes dele existir. |
| **baixa** | `ui/dica.tsx` é arquivo novo em `ui/`, pasta fora de escopo | ✅ **Registrado** em `DECISOES.md` com o motivo e a alternativa descartada. |
| **baixa** | A ata dizia que o shell do viewer "segue claro" — impreciso | ✅ **Texto corrigido.** O `ThemeProvider` é do layout raiz e cobre `/relatorios/**`: um navegador com `theme=dark` gravado renderiza o viewer escuro. O que a decisão garante é que **ele não tem como trocar**; no caso normal (visualizador externo, sem preferência gravada) o `defaultTheme="light"` entrega claro. `forcedTheme` foi descartado de propósito — travaria também o operador, que escolheu o escuro. |
| **baixa** | Login anuncia o erro **duas vezes** ao leitor de tela (toast + `role="alert"`) | ⚠️ **Mantido.** É trade-off explícito da ordem ("**além do toast**, mostre o erro inline persistente (`<p role="alert">`)"). Registrado aqui como conhecido. Se um dia incomodar, o mínimo é trocar o `role="alert"` por `role="status"`/`aria-live="off"` no `<p>` (que continua visível e persistente) e deixar o anúncio só com o toast. |

Confirmações úteis, por medição própria (a do CSS compilado eu refiz por conta, contando os
seletores e as faixas de `@media` no arquivo gerado): **105** seletores `:is(.dark *)`, **100% dentro
de `@media not print`** — a prova estrutural de que nenhuma variante `dark:` chega ao papel; os 12 ids de Select conferidos **par a par,
string por string**, sem typo; `target:[&>div]:ring-2` compila para
`.target\:\[\&\>div\]\:ring-2:target>div`, mirando o `<div>` filho como exigido; e o `TooltipProvider`
presente nos **dois** ramos do `(app)/layout.tsx` — necessário porque o `ui/tooltip.tsx` deste repo
não auto-embrulha o Provider.

**Após as correções:** `lint` limpo · `build` 24 rotas · `vitest` **58 arquivos / 1119 testes**
(+6 da validação do destino do "Voltar") · smoke **24/24**.

### Segunda rodada (re-revisão das correções)

Três lentes novas, também em contexto fresco, com a pergunta invertida: *as correções resolvem mesmo,
e quebraram alguma coisa?* **Duas voltaram limpas** — a do `try/catch` + anel `:target` e a de
integridade geral. A terceira confirmou que o "Voltar" funciona (chegou a ler o código do `Link` do
Next para provar que não há navegação dupla, e rodou as 30 entradas de segurança) e achou **um único
defeito, de documentação**: o `CHANGELOG.md` ainda descrevia o mecanismo **rejeitado**
(`history.back()` + referrer) na mesma entrada em que explicava por que ele não funciona.
✅ **Corrigido.** Nenhum achado de código nesta rodada.

Duas confirmações que a re-revisão trouxe e que valem registro: o `isSubmitting` do react-hook-form
**não** fica preso com o `catch` novo (o reset acontece antes do rethrow, então resolver em vez de
rejeitar dá o mesmo resultado — nenhum botão travado em "Salvando…"), e o `try/catch` de
`lista-visitada.ts` envolve o **próprio acesso** a `sessionStorage`, não só a chamada — então até o
`SecurityError` de modo privado/iframe particionado é capturado e o link degrada para `/ativos`.

---

## 7. O que este relatório NÃO prova

Honestidade sobre os limites da verificação:

- **Nenhuma tela logada foi aberta no navegador.** Não existe `.env.smoke` nesta máquina, então o
  passo [5] do smoke foi pulado. O que ficou provado sem credencial: as rotas protegidas
  **redirecionam** para `/login`, e toda a máquina de tema/impressão funciona (ela vive no root
  layout, que é o mesmo para as telas logadas). O que **não** foi visto rodando: dashboard, `/ativos`
  e `/movimentacoes/nova` renderizados no tema escuro. → **checklist manual do §10.**
- **Nenhum erro de rede foi provocado de verdade.** Os `try/catch` do P1-1 estão no código e o build
  os aceita, mas nenhum throw de transporte foi injetado para ver o toast aparecer.
- **Nenhum leitor de tela foi executado.** `role="alert"`, `aria-current`, `htmlFor`/`id` e os
  tooltips foram conferidos por leitura do DOM/código, não por NVDA/JAWS.
- **Nenhuma impressão em papel.** A prova é a emulação de mídia `print` do Chromium, que é o que o
  `Ctrl+P` usa para resolver CSS — mas não cobre driver de impressora.
- **Contraste é cálculo, não percepção.** O script implementa a fórmula da WCAG 2.1 sobre os valores
  declarados; não avalia legibilidade em monitor descalibrado nem daltonismo (para isso, o app
  mantém a regra de nunca usar cor como canal único — o Δ continua com seta ▲▼).

---

## 8. Fora de escopo, respeitado

Nada de banco (0 migration, `supabase/` intocado), nada em `src/lib/actions/**`, validators ou
queries; nenhuma dependência nova (`package.json` e `package-lock.json` **não** aparecem no diff);
templates, `scripts/` de carga/seed e `mockups/` intocados; nenhum `db:reset`/`db:seed` executado;
nenhuma variante `dark:` existente removida; nenhum dado real em código, teste ou screenshot.

> **Incidente de ambiente, resolvido:** no meio da execução, três pacotes (`exceljs`, `pizzip`,
> `docxtemplater` — justamente os `serverExternalPackages`) ficaram com o diretório **vazio** em
> `node_modules` e o build passou a falhar com "Module not found". Resolvido com `npm ci`
> (determinístico, a partir do lockfile). Conferido depois: `package.json` e `package-lock.json`
> **não** foram alterados — a stack fechada continua intacta.

---

## 9. Pendências

| # | Pendência | O que falta |
|---|---|---|
| 1 | ~~`git push origin main`~~ ✅ **feito** | `37774eb..127bdf7 main -> main`, com todos os critérios verdes. **Não verifiquei o build na Vercel** — sem o team ID nesta máquina o MCP não lista os deployments. O push dispara o deploy; conferir em vercel.com. |
| 2 | ~~Smoke logado~~ ✅ **feito** | O Johnny criou o `.env.smoke`; o passo [5] rodou e passou: login, dashboard, `/ativos` e `/movimentacoes/nova` nos **dois temas**, todos 200 e sem erro de console. Ver §5. |
| 3 | ~~Backlog: `text-green-700`/`bg-green-100` a 4,4996:1~~ ✅ **feito** | 12 ocorrências em 10 arquivos → `text-green-800` (**4,4996 → 6,45:1**). Ver §3. |
| 4 | Backlog: `<Label>Itens faltantes na devolução</Label>` | Rotula um GRUPO de checkboxes; o certo é `<fieldset>/<legend>`, não `htmlFor`. Mudança estrutural, maior que esta varredura. |
| 5 | Backlog: chip "em breve" da sidebar é **código morto** | O ramo placeholder de `sidebar-nav.tsx` nunca renderiza (todos os 8 itens têm `href`). O ajuste de 10 → 11px foi feito assim mesmo, mas o bloco é candidato a remoção. |

---

## 10. Checklist manual de 2 minutos (para o Johnny ao voltar)

1. **Login** — entre normalmente. Depois erre a senha de propósito: além do toast, o erro agora
   **fica** escrito sob o formulário (não some sozinho).
2. **Alternar tema** — avatar no canto superior direito → **Tema** → Claro / Escuro / Sistema.
   Confira: o item ativo tem **✓**; recarregar a página mantém a escolha; "Sistema" acompanha o
   Windows; e os **toasts** ficam escuros no tema escuro (antes seguiam o Windows, não o app).
3. **Imprimir no escuro** — com o tema **Escuro** ativo, abra um relatório
   (`/relatorios/geral`) e dê `Ctrl+P`. A pré-visualização tem de sair **clara**, com as pílulas de
   tipo e os cards legíveis.
4. **Erro de validação no lote** — `/movimentacoes/nova`, monte um lote e tente avançar sem escolher
   o tipo. O box "Revise antes de continuar" agora é anunciado por leitor de tela (`role="alert"`).
   Aproveite e confira os `<Select>`: clicar no rótulo "Tipo de movimentação" agora **foca** o campo.
5. **Ficha do ativo** — abra `/ativos`, **filtre** alguma coisa, entre numa ficha e clique em
   "Voltar para ativos": o filtro tem de voltar do jeito que estava. Na mesma ficha, as ações
   "Corrigir patrimônio" e "Definir service tag" agora vivem no menu **⋯**.

---

## 11. Git

Oito commits acima de `37774eb`, **já empurrados** para `origin/main` (`37774eb..127bdf7`):

```
caeeb62 docs(f19): CHANGELOG descrevia o mecanismo REJEITADO do "Voltar" (achado da re-revisao)
ee875c0 docs(f19): corrige numeros do relatorio e do CHANGELOG conferindo a saida real
ad78eef fix(f19): 3 achados da revisao adversarial + CHANGELOG e relatorio
1de39fa fix(f19): smoke nao pode dar verde comparando vazio com vazio
1a3ba37 feat(f19): selects com nome acessivel, varredura dark: e polimentos de UX (P1-2, P2)
947dc68 feat(f19): toggle de tema, contrastes medidos e smoke do modo escuro
10fa2f4 fix(f19): rede muda em mutacao — try/catch em toda chamada client de action (P1-1)
03c9271 feat(f19): liga o modo escuro (opt-in) + PLAN.md, baseline e script de contraste
```

79 arquivos, 3239 inserções, 430 remoções. O `PLAN.md` na raiz é o gabarito antifuga usado pelas
duas rodadas de revisão — pode ser apagado a qualquer momento.
