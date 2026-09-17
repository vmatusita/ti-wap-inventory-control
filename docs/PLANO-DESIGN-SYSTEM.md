# Plano — sistema de design: dar à camada visual a disciplina que o resto do sistema já tem

Levantamento e plano de execução de **30/08/2026**. Autossuficiente: quem ler este arquivo
consegue executar a entrega sem a conversa que o originou.

**O problema em uma frase:** o Estoque TI WAP põe a regra de negócio no Postgres, guarda a
fronteira RSC com teste, espelha TS↔SQL com seis travas e mede 73 pares de contraste no CI — e
**nada disso alcança o desenho da tela**. Ali, cada uma das 32 rotas inventa o próprio padrão:
**190 molduras de cartão feitas à mão** contra 17 arquivos que usam o `Card`, **19 cabeçalhos de
página copiados**, **4 telas de entrada idênticas** sem nenhum `<h1>`, **23 estados vazios
desenhados à mão** ao lado de um componente `EstadoVazio` que já existe, e **555 classes de cor
crua do Tailwind** em 60 arquivos.

**O que este plano entrega:** um sistema de layout e cor de verdade — poucos componentes, uma
escala de espaçamento, tokens semânticos de status — aplicado às 32 rotas, com **um teste que
reprova a regressão** escrito no molde que a casa já usa. Zero dependência nova, zero mudança de
banco, zero mudança de regra de negócio.

**O que este plano NÃO faz:** não toca em formulário (os 30 `useState` do `nova-compra-form` são
outra frente), não toca nas recomendações R2–R5 de [`SYSTEM-DESIGN-2026-08-30.md`](SYSTEM-DESIGN-2026-08-30.md),
não muda cor nenhuma que o operador vê (§3.3 explica como), e não inventa vocabulário — o
`src/lib/dominio.ts` continua sendo a fonte única do rótulo e da família de cor.

**A referência de CÓDIGO é o repositório irmão** (`../stefanini-ti-inventory-control`, o Acervo),
que passou por esta mesma travessia em 21/08/2026 e registrou o que mediu — inclusive os dois
enganos que cometeu no caminho (§3.2). Como manda a **regra 2** do `CLAUDE.md`
("NUNCA dados reais"): copiam-se padrões, nunca dados.

---

## 1. O inventário — o que existe hoje

Medido em 30/08/2026 contra a `main`, por quatro varreduras independentes, arquivo por arquivo.
Cada número abaixo tem o comando que o reproduz em §1.6. A coluna "variante" das tabelas é a
decisão deste plano (§3.2), não o estado atual.

### 1.1 A régua horizontal — e a boa notícia

| peça | arquivo:linha | classe |
|---|---|---|
| conteúdo (operador) | `src/app/(app)/layout.tsx:170` | `min-w-0 flex-1 p-4 md:p-6` |
| conteúdo (visualizador) | `src/app/(app)/layout.tsx:212` | `min-w-0 flex-1 p-4 md:p-6` |
| cabeçalho do app | `src/components/layout/app-header.tsx:63` | `h-14 … px-4 … md:px-6` |
| cabeçalho do visualizador | `src/components/layout/viewer-header.tsx:42` | `h-14 … px-4 … md:px-6` |

**Os dois batem.** `px-4 md:px-6` no cabeçalho = `p-4 md:p-6` no conteúdo: a borda inferior do
cabeçalho alinha ao pixel com a margem do conteúdo, nos dois breakpoints e nas duas portas. Esse
foi o **defeito nº 4 do irmão** (`px-4` contra `p-6`, 8px de desalinhamento em toda tela) e aqui
ele não existe. **A régua horizontal do WAP está certa e este plano não a toca.**

A única divergência do eixo é a barra lateral (`src/components/layout/sidebar-lateral.tsx:48`,
`p-3`), que é outra superfície, com fundo próprio — fica como está.

### 1.2 A casca de página das 32 rotas

`h1 ⇧` = a rota não tem `<h1>` próprio; herda o do layout do grupo.

| # | rota | container (arquivo:linha) | `<h1>` | ritmo | variante nova |
|---:|---|---|---|---|---|
| 1 | `/` | `(app)/page.tsx:170` · `space-y-6` | L173 | `space-y-6` | **cheia** |
| 2 | `/ativos` | `ativos/page.tsx:191` · `space-y-5` | L195 | `space-y-5` | **cheia** |
| 3 | `/ativos/[id]` | `ativos/[id]/page.tsx:176` · `space-y-6` | L191 (`tabular-nums`) | `space-y-6` | **cheia** |
| 4 | `/ativos/novo` | `ativos/novo/page.tsx:54` · `mx-auto max-w-3xl space-y-6` | L65 | `space-y-6` | **cheia** + medida de formulário |
| 5 | `/itens` | `itens/page.tsx:298` · `space-y-4` | L302 | `space-y-4` | **cheia** |
| 6 | `/itens/conferencia` | `itens/conferencia/page.tsx:80,98,122,135` · `space-y-4` (4 ramos) | L64 | `space-y-4` | **cheia** |
| 7 | `/movimentacoes` | `movimentacoes/page.tsx:137` · `space-y-5` | L141 | `space-y-5` | **cheia** |
| 8 | `/movimentacoes/nova` | `movimentacoes/nova/page.tsx:254` · `mx-auto max-w-3xl space-y-6` | L257 | `space-y-6` | **cheia** + medida de formulário |
| 9 | `/movimentacoes/devolucao-fornecedor` | `…/page.tsx:59,85,113` · `mx-auto max-w-3xl space-y-6` (3 ramos) | L117 | `space-y-6` | **cheia** + medida de formulário |
| 10 | `/pendencias` | `pendencias/page.tsx:234` · `space-y-4` | L238 | `space-y-4` | **cheia** |
| 11 | `/relatorios/[filial]` | `relatorios/[filial]/page.tsx:151` · `space-y-4` | L155 | `space-y-4` | **cheia** |
| 12 | `/relatorios/gerados` | `…/gerados/page.tsx:89` · `space-y-4` | L93 | `space-y-4` | **cheia** |
| 13 | `/relatorios/gerados/[id]` | `…/gerados/[id]/page.tsx:73` · `space-y-4` | L109 | `space-y-4` | **cheia** |
| 14 | `/relatorios/acesso` | `…/acesso/page.tsx:21` · **sem container** | **nenhum** | — | **casco de autenticação** |
| 15 | `/ajuda` | `ajuda/page.tsx:39` · `space-y-6` | L42 | `space-y-6` | **cheia** |
| 16 | `/ajuda/[slug]` | `ajuda/[slug]/page.tsx:49` · `max-w-3xl space-y-6` (**sem `mx-auto`**) | L76 | `space-y-6` | **estreita** |
| 17 | `/ajuda/manual` | `ajuda/manual/page.tsx:25` · `max-w-3xl space-y-8` (**sem `mx-auto`**) | L35 | `space-y-8` | **estreita** |
| 18 | `/versoes` | `versoes/page.tsx:33` · `space-y-6` | L36 | `space-y-6` | **estreita** |
| 19 | `/admin/colaboradores` | `admin/colaboradores/page.tsx:25` · `space-y-8` | h1 ⇧ `admin/layout.tsx:26` | `space-y-8` | **cheia** |
| 20 | `/admin/filiais` | `admin/filiais/page.tsx:22` · `space-y-4` | h1 ⇧ | `space-y-4` | **cheia** |
| 21 | `/admin/importar` | `admin/importar/page.tsx:39` · `space-y-6` | h1 ⇧ | `space-y-6` | **cheia** |
| 22 | `/admin/itens` | `admin/itens/page.tsx:25` · `space-y-4` | h1 ⇧ | `space-y-4` | **cheia** |
| 23 | `/admin/kits` | `admin/kits/page.tsx:40` · `space-y-4` | h1 ⇧ | `space-y-4` | **cheia** |
| 24 | `/admin/motivos` | `admin/motivos/page.tsx:23` · `space-y-4` | h1 ⇧ | `space-y-4` | **cheia** |
| 25 | `/admin/senhas` | `admin/senhas/page.tsx:25` · `space-y-4` | h1 ⇧ | `space-y-4` | **cheia** |
| 26 | `/admin/tipos-item` | `admin/tipos-item/page.tsx:16` · `space-y-4` | h1 ⇧ | `space-y-4` | **cheia** |
| 27 | `/admin/usuarios` | `admin/usuarios/page.tsx:46,82,124` · `space-y-4` (×3) | h1 ⇧ | `space-y-4` | **cheia** |
| 28 | `/dev` | `dev/page.tsx:92` · `space-y-4` | h1 ⇧ `dev/layout.tsx:31` | `space-y-4` | **cheia** |
| 29 | `/dev/destrutivo` | `dev/destrutivo/page.tsx:65` · `space-y-4` | h1 ⇧ | `space-y-4` | **cheia** |
| 30 | `/login` | `login/page.tsx:96` · `flex min-h-svh … px-4 py-10` + Card `max-w-sm` | **nenhum** | `space-y-4` | **casco de autenticação** |
| 31 | `/auth/confirm` | `auth/confirm/page.tsx:38` · idem | **nenhum** | `space-y-4` | **casco de autenticação** |
| 32 | `/auth/definir-senha` | `auth/definir-senha/page.tsx:32` · idem | **nenhum** | — | **casco de autenticação** |

### 1.3 As dez inconsistências confirmadas

**1. Quatro rotas sem `<h1>` nenhum — e são as quatro portas do sistema.** `/login`,
`/auth/confirm`, `/auth/definir-senha` e `/relatorios/acesso` não têm `<h1>`, `<h2>` nem
`CardTitle`. O nome da tela existe só no `<title>` da aba e na `<Marca>` gráfica. Quem usa leitor
de tela abre as quatro portas do produto sem saber onde está.

**2. O `<h1>` é o ponto forte, e é por isso que ele tem de virar componente.** 19 `<h1>` com
classe escrita à mão, **18 deles com a string idêntica** `text-2xl font-semibold tracking-tight`
(o 19º acrescenta `tabular-nums` no patrimônio da ficha). Zero `<h1>` em `src/components`. O
tamanho já é único; o que diverge é **a moldura em volta dele** — o par `<h1>` + `LinkAjuda`
aparece em 5 arranjos: `flex items-center gap-1` (7×), `gap-0.5` (2×), `flex flex-wrap items-center gap-1`
(4×), `gap-3` (1×), e a linha externa alterna `justify-between gap-3` (8×) com `gap-4` (1×).
Consolidar isso não muda um pixel na maioria das telas — é o caso mais barato do plano.

**3. Quatro ritmos verticais para o mesmo gênero de tela.** `space-y-4` (17 rotas) ·
`space-y-6` (9) · `space-y-5` (2) · `space-y-8` (2) — 30 das 32; as duas restantes são portas sem
ritmo de página. Telas irmãs divergem: `/pendencias` e
`/itens` ritmam a 16px enquanto `/ativos` e `/movimentacoes` — as outras duas listas com filtro —
ritmam a 20px. Dentro de `/admin`, sete páginas usam `space-y-4` e duas fogem
(`colaboradores/page.tsx:25` com `space-y-8`, `importar/page.tsx:39` com `space-y-6`).

**4. `space-y-5` não é canto de componente: é a raiz de dois layouts.** 15 ocorrências, sendo
`admin/layout.tsx:23` (afeta 9 rotas) e `dev/layout.tsx:29` (afeta 2). É o passo fora de escala
mais estrutural do repositório.

**5. 51 ocorrências de espaçamento fora da escala** `{0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16}` nas
telas, em 11 passos: `space-y-5` (15) · `py-10` (10) · `pl-5` (7) · `p-5` (5) · `py-5` (4) ·
`pt-5` (3) · `space-y-10` (2) · `pl-7` (1) · `pt-9`, `pl-9`, `pr-32`, `gap-x-5` (1 cada). Os dois
piores estão no mesmo elemento: `src/components/relatorios/resumo-periodo.tsx:48` —
`pt-9 pr-0 … sm:pt-0 sm:pr-32`.

> A varredura ingênua devolve **56**, e os 5 excedentes são `data-inset:pl-7` de
> `src/components/ui/dropdown-menu.tsx` — arquivo da CLI do shadcn, que §2.1 congela. **A meta é 51,
> não 56**, e o teste de §4.1 tem de excluir `src/components/ui/` de verdade (§1.6).

**6. 190 molduras `rounded-* + border` à mão, em 99 arquivos, contra 17 arquivos que usam o
`Card`.** Onze para cada um. E os raios divergem dentro do mesmo módulo: `pendencias/page.tsx:268`
e `:300` usam `rounded-xl border bg-card`, `relatorios/gerados/page.tsx:151` usa
`rounded-lg border`, `admin/senhas/page.tsx:41` usa `rounded-lg border` e `itens/page.tsx:408,437`
volta ao `rounded-xl`. Distribuição: `rounded-lg` 133 · `rounded-md` 38 · `rounded-xl` 16 ·
`rounded-full` 3 — os 190.

**7. O `EstadoVazio` existe e 23 telas o ignoram — inclusive copiando-o byte a byte.**
`src/components/layout/estado-vazio.tsx` é importado por **12** arquivos. Fora deles há **23
strings com `border-dashed`** escritas à mão, em 10 geometrias (`py-16`, `py-12`, `py-10`, `p-8`,
`p-6`, `py-8`, `py-6`, `p-3`, `p-2.5`, `px-3 py-2`), mais 8 vazios **sem moldura nenhuma** na família de tabelas
de relatório e 3 `<p>` soltos. A cópia mais literal:
`src/app/(app)/relatorios/gerados/page.tsx:126` repete a string exata de `estado-vazio.tsx:53`,
sem importar o componente.

**8. O bloco de alerta tem ≥8 anatomias e nenhum componente.** 39 `role="alert"` em 14 arquivos
contra apenas 5 `aria-live` em 3 — assimetria de 8:1 entre "interrompe" e "informa". A caixa
vermelha aparece em 12 sítios com 4 medidas (`rounded-lg …/40 p-3 text-sm text-destructive` ·
`rounded-md …/40 p-3` · `rounded-lg …/50 p-3` **sem `text-destructive`** · `… p-4` sem `text-sm`).
A caixa âmbar aparece em **23** sítios com 6 medidas e 4 bordas diferentes. Os dois componentes que
existem não cobrem o caso: `painel-erro.tsx` serve a 6 dos 7 `error.tsx` (o global `src/app/error.tsx` fica de fora), e
`aviso-sem-escrita.tsx` é
uma **mensagem congelada** (3 usos), não um componente de aviso.

**9. Cinco cartões de métrica para a mesma ideia, com a ordem de leitura invertida entre eles.**
`relatorios/kpi-tiles.tsx:134` (rótulo→número, `px-3.5 py-3`, **sem `tabular-nums`**, 7 tiles
fixos na const `TILES:50`) · `admin/importar/importar-wizard.tsx:82` (número→rótulo, `p-4`,
`text-3xl`) · `admin/fila-consolidacao.tsx:270` (rótulo→número, `p-3`, `text-2xl`) ·
`relatorios/pendencias-chips.tsx:7` (a mesma informação como pílula) ·
`relatorios/card-relatorio.tsx` (49 usos, moldura paralela ao `Card`).

**10. A casca de autenticação está copiada 4×, com 8 das 9 linhas estruturais idênticas string
por string.** `login/page.tsx:96`, `auth/confirm/page.tsx:38`, `auth/definir-senha/page.tsx:32` e
`relatorios/acesso-form.tsx:25`. As duas únicas divergências reais: o subtítulo é `mt-2` numa e
`mt-3` em duas (e ausente na quarta), e o `CreditoAutor` só aparece no login.

### 1.4 A cor — o achado que mais pesa

**555 classes de paleta crua do Tailwind, em 60 arquivos.** Por família: `amber` **310 (56%)** ·
`green` 98 · `red` 52 · `blue` 16 · `violet` 12 · `slate` 12 · `orange` 12 · `gray` 12 ·
`emerald` 11 · `teal` 8 · `sky` 4 · `pink` 4 · `cyan` 4.

Três leituras que mudam o desenho da solução:

**(a) O âmbar já tem token e quase ninguém o usa.** `--warning`/`--warning-foreground` existem
desde a F7F, são medidos, e clareiam sozinhos no `.dark` sem precisar de variante `dark:`. Uso
medido: **13 ocorrências em 5 arquivos** fora de `src/components/ui/` — 19 contando as 6 de
`ui/badge.tsx:18`. A classe crua âmbar: **310**. Para comparação, `destructive` aparece em **115**
classes fora de `ui/` (162 no total): a família de erro está tokenizada, a de aviso não. O callout
`border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200`
é reescrito à mão em dezenas de lugares — sempre com `dark:border-amber-900`; a única exceção do
repositório é `mesa-conflitos.tsx:515` (`dark:border-amber-700/60`).

**(b) Os cinco `--chart-N` são órfãos: zero consumidores.** `grep -r "var(--chart-" src` devolve
**0**. Os gráficos vestem hex de `STATUS_CHART_COLOR` (13 referências em 5 arquivos) ou `var(--color-brand-*)` (17 no total, 13 deles dentro dos componentes de gráfico).
O comentário em `globals.css:96-104` descreve exatamente o problema que a redeclaração da F32
pretendia resolver — a correção foi feita no token e nenhum consumidor migrou.

**(c) O medidor de contraste está certo e não escala.** `scripts/contraste.mjs` roda no CI
(`.github/workflows/ci.yml:60`, antes do build), lê a paleta real de
`node_modules/tailwindcss/theme.css` e os tokens de `globals.css`, e mede **85 pares, 73
exigidos**, saindo com código 1 se algum reprovar. É bom, é honesto e o próprio arquivo admite o
limite (`contraste.mjs:304-305`): *"a lista cobria só o que revisões passadas TOCARAM: nasceu como
prova de correção, não como varredura"*. Consequência medida: **`emerald` (11 ocorrências) e
`sky` (4) estão em uso e não têm nenhum par no medidor.** Cor nova entra sem passar por régua
nenhuma — não porque a régua seja frouxa, mas porque **ela mede uma lista, não uma fonte**.

**(d) A decisão "estado → cor" mora em quatro lugares.** `src/lib/dominio.ts` é o centro real
(`STATUS_META:24`, `STATUS_CHART_COLOR:111`, `TIPO_PILL:189` — este último privado do módulo, exposto
pela função `pillTipo():203`) e é importado por 146 arquivos —
esse é o padrão certo e ele fica. Fora dele: `src/lib/pendencias/rotulos.ts:26` (cor por tipo de
pendência), `src/components/pendencias/fila-pendencias-tabela.tsx:49` (cor por idade) e
`src/lib/relatorios/rotulo-grafico.ts:14` (`BRAND_AZUL = '#2a78d6'`, cópia manual do token, com
teste que quebra se divergir).

**(e) Uma tinta serve a dois usos incompatíveis.** `STATUS_CHART_COLOR` é usada em **cinco
superfícies** (acento do KPI tile, barra do acervo, segmento empilhado, série temporal, swatch do
glossário — 13 referências em 5 arquivos) e `STATUS_META` pinta o badge. O selo é **texto** (piso 4,5:1); o segmento é **área** (piso 3:1 pela
WCAG 1.4.11). Duas réguas, uma tinta. É daí que saem os dois alívios registrados hoje:
`#06b6d4` a **2,43:1** sobre o card claro e `#6d28d9` a **2,52:1** sobre o card escuro. Ver §3.4.

### 1.5 Os valores arbitrários

**49 tamanhos de fonte arbitrários** — `text-[11px]` (29), `text-[10px]` (14), `text-[13px]` (6) —
nenhum na escala. Concentração: `src/components/relatorios/` (21), `itens/` (9),
`movimentacoes/` (9), `layout/` (4), `ativos/` (3), `src/app` (3).
`src/components/movimentacoes/lista-movimentacoes.tsx:125,135,144,149,176` mistura `10px` e `11px`
no mesmo componente.

**32 larguras de campo em pixel**, com 11 valores distintos (220px×8, 170px×6, 160px×6, 150px×3,
200px×2, 190px×2, e 96/140/180/240/260px), em filtros equivalentes:
`dev/auditoria-filtro-dev.tsx:79,102,128,142,161` usa 220/200/150/150/220px;
`itens/historico-filtros.tsx:114,132,163,196,214` usa 220/200/170/160/160px.

**Duas convenções concorrentes para altura de diálogo:** `max-h-[calc(100svh-2rem)]` (15) contra
`max-h-[90svh]` (13), mais `max-h-[92vh]` (2) e `max-h-[64vh]` (2). A do `calc` já é maioria — o
sistema adota **ela** e converte as outras 17, em vez de escolher no braço.

### 1.6 Como reproduzir cada número

```bash
# 555 classes de paleta crua / 60 arquivos
grep -rEoh "\b(bg|text|border|ring|fill|stroke)-(red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-(50|100|200|300|400|500|600|700|800|900|950)\b" src --include=*.tsx --include=*.ts | wc -l

# 190 molduras à mão / 99 arquivos  ·  17 arquivos com <Card
grep -rEo 'className="[^"]*rounded-[a-z0-9]*[^"]*\bborder\b[^"]*"' src --include=*.tsx | grep -v "src/components/ui/" | wc -l
grep -rl "<Card" src --include=*.tsx | grep -v "src/components/ui/" | wc -l

# 51 passos fora da escala (nas telas; 56 se contar src/components/ui/)
# ATENÇÃO: sem o -h, senão o grep omite o nome do arquivo e o filtro de ui/ fica inerte (dá 56).
grep -rEo "(^|[^a-z-])(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|gap-x|gap-y|space-y|space-x)-(5|7|9|10|11|13|14|15|18|20|24|32)\b" src/app src/components --include=*.tsx | grep -v "src/components/ui/" | wc -l

# 49 fontes arbitrárias  ·  23 border-dashed à mão  ·  0 consumidores de --chart-N
grep -rEoh "text-\[[0-9]+px\]" src --include=*.tsx | wc -l
grep -rEo 'className="[^"]*border-dashed[^"]*"' src --include=*.tsx | grep -v "estado-vazio.tsx" | wc -l
grep -rn "var(--chart-" src --include=*.tsx --include=*.ts | wc -l
```

---

## 2. A base técnica — o que o sistema pode e não pode tocar

### 2.1 Congelado

- **`supabase/migrations/`, `lib/actions`, `lib/queries`, `lib/validators`, `proxy.ts`,
  `src/lib/types/database.ts`** e todo texto de tela. Este plano é de apresentação.
- **Nenhum valor de cor RENDERIZADO muda** (§3.5 explica o mecanismo). O que muda é por onde a
  cor chega ao elemento.
- **As regras de acabamento de `globals.css`** continuam intactas: o `@custom-variant dark` com
  `@media not print` (o mecanismo da F19 que faz o relatório sair sempre claro no papel), as
  regras de `[data-sidebar-lateral]` da F30 e o bloco de impressão.
- **`src/components/ui/`** (shadcn pela CLI) não se edita — regra das Convenções.
- **`src/lib/dominio.ts` continua sendo a fonte única** do vocabulário. Ele não é substituído:
  ele é **descarregado** da cor literal, que passa a viver em token.

### 2.2 O que a documentação oficial atual diz (consultada agora — regra 6)

- **Tailwind v4**: a escala numérica é `calc(var(--spacing) * N)` com `--spacing: 0.25rem`
  (`node_modules/tailwindcss/theme.css:325`). Ou seja `gap-6` = 24px, `p-4` = 16px — **base 4px
  nativa**, exatamente o grid que o sistema pede. O utilitário `container` do v3 não existe mais;
  casco centrado se compõe à mão.
- **shadcn/ui, bloco `dashboard-01`**: cabeçalho e conteúdo compartilham o mesmo par de padding.
  **O WAP já faz isso** (§1.1) — nada a mudar.
- **`Card` atual** (`src/components/ui/card.tsx`): espaçamento interno pela custom property
  `--card-spacing`, `CardContent` é `px-(--card-spacing)`. É a moldura oficial e a única que
  responde a `size`.
- **Next 16** (docs empacotados em `node_modules/next/dist/docs/`): `loading.tsx` embrulha
  `page.tsx` num `<Suspense>` automático e é o único fallback *prefetched*; a doc de streaming
  recomenda que o esqueleto **case as dimensões do conteúdo final**. Dois `loading.tsx` hoje não
  casam (`ativos/novo/loading.tsx:10` e `movimentacoes/devolucao-fornecedor/loading.tsx:9` usam
  `max-w-3xl space-y-5` contra `mx-auto max-w-3xl space-y-6` das páginas).

### 2.3 As duas restrições do medidor de contraste — e elas mandam no desenho dos tokens

`scripts/contraste.mjs:138-165` lê `globals.css` linha a linha com
`/^\s*--([a-z0-9-]+):\s*(.+?);/` e resolve o valor por `parseOklch ?? parseHex ?? corLiteral`.
Disso saem duas regras **não negociáveis** para qualquer token novo:

1. **O valor tem de caber numa linha só**, como `oklch(...)` literal ou `#rrggbb`.
2. **`var(--outro)` NÃO é lido.** O parser devolve `null` e a linha é ignorada em silêncio — e
   token que o medidor não lê **conta como falha, não como aprovação**. É o que acontece hoje com
   `--chart-1` e `--chart-2` (`globals.css:105-106`), declarados como `var(--brand-azul)` e
   `var(--brand-amarelo)`: os dois estão fora da régua sem que nada acuse.

**Consequência de projeto:** os tokens de §3.5 nascem com valor `oklch(...)` literal e o hex + a
razão medida no comentário ao lado — o formato que o irmão usa e que `npm run contraste` lê.

### 2.4 O molde dos testes

`vitest.config.mts` roda em ambiente `node`, `include: ['src/**/*.test.ts', …]` — **`.test.tsx`
não entra na suíte e não há biblioteca de render**. Isso não é lacuna a contornar: é a política da
casa, e ela já produziu **três testes que guardam invariante visual lendo texto-fonte**:

- `src/components/layout/sidebar-colapso.test.ts:25` — *"o estado recolhido é CSS, e o CSS tem
  todos os ganchos"*;
- `src/components/relatorios/impressao-colunas.test.ts:54` — *"as colunas escondidas por largura
  saem na impressão"*;
- `src/components/relatorios/confinamento-viewer.test.ts:95` — *"nenhum link da superfície de
  relatório sai de `/relatorios/**`"*.

**O teste de consistência (§4) é o quarto membro dessa família.** Nenhuma dependência nova.

---

## 3. O SISTEMA

### 3.1 A escala de espaçamento — uma só

Somente estes passos, nas telas (fora de `src/components/ui/`):

| passo | px | uso canônico |
| ---: | ---: | --- |
| `0.5` | 2 | separação óptica dentro de uma pastilha |
| `1` | 4 | rótulo ↔ valor; `h1` ↔ descrição |
| `1.5` | 6 | rótulo ↔ campo em formulário denso |
| `2` | 8 | itens de uma mesma linha de botões; célula de tabela |
| `3` | 12 | itens de uma grade de métricas; grupos irmãos curtos |
| `4` | 16 | **dentro de um grupo** (campos de um formulário, corpo de cartão) |
| `6` | 24 | **entre grupos** (blocos de uma página) — o ritmo padrão |
| `8` | 32 | entre grandes regiões de uma tela longa |
| `12` | 48 | respiro de estado vazio autônomo |
| `16` | 64 | respiro máximo |

**A regra do interno ≤ externo (Gestalt/proximidade):** o padding **dentro** de um grupo nunca é
maior que a distância **entre** grupos. Cartão com `--card-spacing` 16px numa pilha de `gap-6`
(24px): 16 ≤ 24 ✓. Campo com `gap-1.5` (6px) num formulário com `gap-4` (16px): 6 ≤ 16 ✓.

**Proibido nas telas:** qualquer outro passo (`p-5`, `space-y-5`, `py-10`, `pt-9`, `pr-32`) e
qualquer valor arbitrário de espaçamento (`p-[18px]`, `gap-[3px]`).

**O ritmo padrão de página é `gap-6`.** As 17 rotas em `space-y-4` sobem para 24px e as 2 em
`space-y-5` também; as 9 já em `space-y-6` não mudam. É a mudança visual mais ampla do plano e a
mais barata de conferir: uma tela só, aberta lado a lado com o `git stash`.

### 3.2 As variantes de largura — duas, decididas por uma pergunta só

**Esta tela é para LER ou para OLHAR?**

| variante | classe | px | quando |
| --- | --- | ---: | --- |
| `estreita` | `max-w-3xl` | 768 | texto corrido: `/ajuda/[slug]`, `/ajuda/manual`, `/versoes` |
| `cheia` | — | o que a janela tiver | **o padrão** — listas, relatórios, painéis, fichas, formulários |

> **O irmão tinha três, todas com teto** (`estreita` 672 · `padrao` 896 · `larga` 1152), e
> corrigiu depois de ver o resultado num monitor de 1920px: o conteúdo parava no meio da tela e
> sobrava branco à direita, em toda tela. Teto de largura é remédio para **linha de texto**
> comprida demais — não para tabela, grade de números ou gráfico, onde espaço a mais vira coluna
> que não trunca e barra que não rola. **O WAP já está do lado certo dessa lição**: 23 das 32
> rotas não têm teto nenhum hoje. O plano formaliza o que já é prática, em vez de introduzir o
> erro que o irmão desfez.

**A contrapartida, e ela é obrigatória:** com a página ocupando a tela, quem precisa de medida é o
que se lê e o que se digita.

- **Formulário** recebe `MEDIDA_DE_FORMULARIO` (`max-w-3xl`, 768px) no **contêiner dos campos**,
  não na página. Sem isso, o campo "Nome" de `/admin/tipos-item` mediria 1500px para guardar 25
  caracteres.
- **Prosa** dentro de página `cheia` recebe `max-w-3xl` no bloco de texto.

**A decisão que muda aparência, e é a única:** o casco **alinha à esquerda**, sem `mx-auto`. Hoje
`max-w-3xl` aparece com `mx-auto` em 3 rotas (`/ativos/novo`, `/movimentacoes/nova`,
`/movimentacoes/devolucao-fornecedor`) e sem em 2 (`/ajuda/[slug]`, `/ajuda/manual`) — a mesma
largura, dois alinhamentos. O irmão mediu o custo do `mx-auto`: a borda esquerda do conteúdo cai
num lugar diferente por variante, e o cabeçalho do app, que é sempre colado na régua, deixa de
compartilhar coluna com o título justo nas telas estreitas. Alinhado à esquerda existe **uma**
linha vertical no produto inteiro.
> **Se o dono preferir manter os três formulários centrados, o sistema aceita** — `Pagina` ganha
> `centrado` como prop. O que não pode continuar é a mesma largura com dois comportamentos.
> Decidir e registrar em [`DECISOES.md`](DECISOES.md); não travar.

### 3.3 O casco de página

`src/components/layout/pagina.tsx` — três peças, uma responsabilidade cada:

```tsx
<Pagina largura="estreita">
  <CabecalhoDaPagina
    titulo="Ativos"
    ajuda="lista-de-ativos"
    descricao={<>{total} equipamentos</>}
    acoes={<Button>Cadastrar</Button>}
  />
  …blocos…
</Pagina>
```

- **`Pagina`** — `flex w-full min-w-0 flex-col gap-6 ${LARGURAS[largura]}`. **Não tem padding**
  (é do `(app)/layout.tsx`, que já está certo) e **não centraliza**. É a **única** origem de
  `max-w-*` de container no produto.
- **`CabecalhoDaPagina`** — anatomia idêntica em toda tela, e ela **absorve o `LinkAjuda`**, que
  hoje é a origem das 5 variantes de gap do achado 2:
  ```
  <header class="flex flex-wrap items-start justify-between gap-3">
    <div class="flex flex-col gap-1">
      <div class="flex flex-wrap items-center gap-1">
        <h1 class="text-2xl font-semibold tracking-tight">   ← a string que 18 telas já usam
        {ajuda ? <LinkAjuda pagina={ajuda} /> : null}
      <p class="text-sm text-muted-foreground">
    <div class="flex flex-wrap items-center gap-2">
  </header>
  ```
  É a **única** origem de `<h1>` do produto, junto com o casco de autenticação. A prop `titulo`
  aceita `ReactNode` — é o que preserva o `tabular-nums` do patrimônio em `/ativos/[id]`.
- **`SecaoDaPagina`** — `<section>` com `flex flex-col gap-4` e `<h2>` opcional
  (`text-base font-semibold`) + descrição. Para agrupar sem moldura.
- **`CascoDeAutenticacao`** — as 4 portas, com `<h1>` de verdade (podendo ser `sr-only` onde a
  `<Marca>` já é o título visual). Recebe `subtitulo` e `creditoAutor`, que são as duas únicas
  divergências reais entre as cópias de hoje.

### 3.4 A hierarquia tipográfica — quatro degraus, classes exatas

| papel | classe exata | px | onde nasce |
| --- | --- | ---: | --- |
| **título de página** | `text-2xl font-semibold tracking-tight` | 24 | `CabecalhoDaPagina` — só ali |
| **título de seção** | `font-heading text-base leading-snug font-medium` | 16 | `CardTitle` (já é assim) e `SecaoDaPagina` |
| **corpo** | `text-sm` | 14 | padrão de `Card`; explícito fora dele |
| **apoio** | `text-muted-foreground text-sm` | 14 | descrições, contagens |
| **apoio menor** | `text-muted-foreground text-xs` | 12 | rótulo de métrica, metadado de linha |

Salto: 24 → 16 → 14 → 12. **Os 49 `text-[10px]`/`[11px]`/`[13px]` caem para `text-xs` (12px).**

> A linha do título de seção **descreve o `CardTitle` que já existe**, não o reescreve: §2.1 congela
> `src/components/ui/`. Duas consequências que o executor precisa saber de antemão — o peso é
> `font-medium` (não `semibold`), e com `size="sm"` o `CardTitle` cai para `text-sm` (14px) por
> `group-data-[size=sm]/card:text-sm`. Como §3.7 usa `<Card size="sm">` no `CartaoDeMetrica`, o
> rótulo dele é 14px por construção — e é por isso que o rótulo do cartão de métrica é um `<span>`
> `text-xs`, não um `CardTitle`.
Onde 12px for grande demais para caber, o problema é a densidade do bloco, não a fonte — e a
correção é o bloco. `text-2xl` sobrevive em mais um lugar: o número do cartão de métrica (§3.6),
que é dado, não título.

### 3.5 Os tokens semânticos de cor — a migração que NÃO muda cor nenhuma

Este é o coração do plano, e o mecanismo é o que o torna seguro.

**O problema não é que o WAP escolheu cor errada.** As nove cores de `STATUS_META` foram medidas
e ajustadas matiz a matiz — `dominio.ts:17-22` registra que o verde desceu para `green-800` porque
`green-700/green-100` dá 4,4996:1 e reprova AA **por 0,0004**. Isso é a régua certa, aplicada à
mão. **O problema é que a régua mede uma lista de 73 pares, e a cor mora em 555 classes.**

**A correção é mudar a fonte, não o valor.** Para cada família de status nascem dois tokens em
`globals.css`, com o valor **copiado de `node_modules/tailwindcss/theme.css`** — o mesmo arquivo
que o medidor já lê:

```css
/* AS NOVE FAMÍLIAS DE SELO. Os valores são os MESMOS oklch que `bg-green-100`
   e `text-green-800` já entregam hoje (copiados de theme.css do Tailwind v4):
   nenhum pixel muda de cor. O que muda é que a cor passa a ter NOME, e nome
   é o que o medidor e a guarda conseguem alcançar. */
--selo-em-estoque: oklch(96.2% 0.044 156.743);        /* = green-100 */
--selo-em-estoque-texto: oklch(44.8% 0.119 151.328);  /* = green-800 — 6,45:1 */
--selo-em-uso: oklch(93.2% 0.032 255.585);            /* = blue-100  */
--selo-em-uso-texto: oklch(48.8% 0.243 264.376);      /* = blue-700  — 5,59:1 */
…as outras sete famílias, e as nove do `.dark`
```

E `STATUS_META` deixa de escrever paleta:

```ts
em_estoque: { rotulo: 'Em estoque',
  badge: 'bg-selo-em-estoque text-selo-em-estoque-texto border-transparent' },
```

**O que isso compra, em ordem:**

1. **`npm run contraste` passa a medir o token**, e o par vira `{ texto: 'selo-em-estoque-texto',
   fundo: 'selo-em-estoque' }` — resolvido pelo mesmo `resolver()` de hoje, sem uma linha nova no
   medidor. As razões medidas continuam idênticas, porque as cores são idênticas.
2. **A guarda de §4.2 passa a ser possível.** Enquanto a cor for `bg-green-100` escrito no JSX,
   nenhum teste consegue distinguir "verde de status" de "verde qualquer".
3. **`emerald` e `sky`, hoje em uso sem nenhum par medido, deixam de ter onde se esconder.**
4. **O tema por empresa, se um dia vier** (é o que o irmão fez), passa a ser reescrever tokens —
   não caçar 555 classes.

**Escrever as classes por extenso, nunca por template.** `bg-selo-${familia}` não funciona: o
Tailwind v4 varre nomes literais no fonte. O mapa `CLASSE_DA_FAMILIA` escreve as nove strings
inteiras, com o motivo em comentário — é o que o irmão faz em `lib/tema/cores.ts`.

**A mesma migração vale para o âmbar**, que é 56% do problema: o token `--warning` já existe e já
é medido. O componente `Aviso` (§3.6) passa a ser o único lugar que sabe pintar um callout, e as
~30 caixas âmbar à mão viram três intenções.

### 3.6 A tinta de área ≠ a tinta de texto — a decisão que fica aberta

O irmão registrou a medição que o WAP ainda não fez: **selo e gráfico não podem usar a mesma
tinta**, porque as réguas são diferentes. O selo é texto sobre pastilha clara — piso 4,5:1, o que
o obriga a ser escuro e de croma baixo. O segmento de gráfico é área — piso 3:1 pela WCAG 1.4.11,
o que lhe dá três pontos de folga para saturar. O irmão tentou vestir o gráfico com a tinta do
crachá e o resultado foi "oito tintas escuras e quase da mesma luminosidade, lado a lado, que saem
mortas".

**O WAP faz o inverso e paga o mesmo preço, do outro lado:** `STATUS_CHART_COLOR` é uma tinta
escolhida para área, usada também como acento de KPI tile e swatch de glossário — e é dela que
saem os **dois alívios abaixo do piso** registrados hoje (`#06b6d4` a **2,43:1** e `#6d28d9` a
**2,52:1**, medidos agora por `npm run contraste`).

**Este plano NÃO resolve isso, e é deliberado.** Separar as tintas muda a cor dos gráficos — é
mudança visível, exige nova rodada de medição de ΔE sob simulação de daltonismo (a análise de
10/08 §4 é o precedente) e é matéria de decisão do dono, não efeito colateral de uma refatoração
de layout. O que o plano faz é **deixar o terreno pronto**: com `--grafico-<familia>` nascendo
como apelido de `--selo-<familia>-texto`, trocar a tinta um dia é editar uma linha de
`globals.css` — hoje é editar `dominio.ts` e torcer para `fillRotuloSegmento` entender o valor
novo (a armadilha documentada em `dominio.ts:108-110`).

Registrar em [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md) como item novo, com os dois números medidos.

### 3.7 Os blocos reutilizáveis

| componente | arquivo | substitui | ocorrências |
| --- | --- | --- | ---: |
| `Pagina` + `CabecalhoDaPagina` + `SecaoDaPagina` | `layout/pagina.tsx` | 19 cabeçalhos à mão, 4 ritmos, 2 alinhamentos | 32 rotas |
| `Aviso` (3 intenções: erro · atenção · informação) | `layout/aviso.tsx` | 12 caixas vermelhas em 4 medidas + ~30 âmbares em 6 | ~42 |
| `CartaoDeMetrica` + `GradeDeMetricas` | `layout/cartao-de-metrica.tsx` | as 5 implementações do achado 9 | ~70 |
| `CascoDeAutenticacao` | `layout/casco-de-autenticacao.tsx` | a casca copiada 4× | 4 |
| `QuadroDeTabela` | `layout/quadro-de-tabela.tsx` | as 2 molduras de tabela + o vazio refeito por tela | 29 tabelas |
| `ConfirmacaoDigitada` | `layout/confirmacao-digitada.tsx` | as 4 implementações de "digite X para confirmar" | 4 |
| `EstadoVazio` | **já existe** — falta adoção | as 23 `border-dashed` à mão + 8 vazios sem moldura | 12 → ~40 |

**Anatomia do `Aviso`** — a intenção decide cor **e** papel ARIA, o que corrige de passagem a
assimetria de 8:1 do achado 8. A tinta do âmbar é **`text-warning`, nunca `text-warning-foreground`**:
o `-foreground` é quase branco no tema claro (`globals.css:92`) e mede **1,10:1** sobre
`bg-warning/10`, enquanto `text-warning` mede **4,92:1** — é o par que `ui/badge.tsx:18` já usa, e é
o que o comentário de `globals.css:88` documenta.
```
erro      → role="alert"    · border-destructive/40 bg-destructive/5 text-destructive
atenção   → role="status"   · border-warning/40 bg-warning/10 text-warning
informação→ (sem role)      · border bg-muted/50
caixa única: rounded-lg border p-3 text-sm
```

**Anatomia do `CartaoDeMetrica`** — o rótulo em cima, o número embaixo: a leitura vai do que a
coisa é para quanto ela é. Resolve a inversão do achado 9 e devolve `tabular-nums` ao
`kpi-tiles`, o único dos cinco que o perdeu — justo o que serve ao dashboard e aos relatórios.
```
<Card size="sm">
  <CardContent class="flex flex-col gap-1">
    <span class="text-muted-foreground text-xs">{rotulo}</span>
    <span class="text-2xl font-semibold tabular-nums">{valor}</span>
```

**O que o WAP NÃO precisa, e vale nomear:** o irmão precisou de um `campo.tsx` com
`CLASSE_DE_CAMPO` e `SelectNativo` porque tinha 3 strings de `<select>` cru. **O WAP tem zero
`<select>` nativo e zero `<input type="file">` cru** — o `Select` do Radix é importado por 29
arquivos e o único seletor de arquivo passa pelo `<Input>` do kit. Isso é disciplina que já
existe; o plano só herda dela a constante `MEDIDA_DE_FORMULARIO`.

**Extensão do `EstadoVazio`:** hoje a prop `acao` só aceita `{ href, rotulo }`
(`estado-vazio.tsx:13`). Vários dos 23 vazios à mão precisam disparar um diálogo, não navegar —
daí parte da divergência. `acao` passa a aceitar `ReactNode` também; a assinatura antiga continua
válida (os 12 usos atuais não mudam).

### 3.8 Uma moldura só: `Card`

Todo agrupamento com borda numa página vem do `Card` do shadcn ou de um componente do sistema.
Nenhum `rounded-* border` cru sobrevive nas telas.

- Frame sem padding: `<Card className="py-0">`.
- Frame denso (métrica, linha De→Para): `<Card size="sm">`.
- **A borda tracejada do estado vazio continua sendo tracejada** — ela é `EstadoVazio`, não
  `Card`, e é o único `border-dashed` legítimo do produto.
- **Impressão:** o `Card` desenha o traço com `ring-1` (box-shadow), e navegador **descarta
  box-shadow no papel**. Como o relatório impresso é feature (F19) e ele vai passar a ser feito de
  `Card`, `globals.css` ganha, **dentro do `@media print` que já existe**, a conversão do anel em
  borda real. Nenhuma linha `oklch` é tocada — `npm run contraste` continua lendo o arquivo do
  mesmo jeito.

---

## 4. Os dois testes — a definição executável de "consistente"

Ambos no molde de `sidebar-colapso.test.ts` e `confinamento-viewer.test.ts`: leem **texto-fonte**
com `readFileSync`/`readdirSync` e afirmam sobre a string. Ambiente `node`, zero dependência nova.

### 4.1 `src/lib/layout/consistencia.test.ts` — as sete regras

Varre `src/app/**` e `src/components/**` (exceto `src/components/ui/**`), **com os comentários
removidos antes de casar** — comentário não renderiza, e os deste repositório citam pelo nome
justamente o que as regras proíbem.

| # | regra | reprova quando |
| ---: | --- | --- |
| 1 | **um só `<h1>`** | `<h1` fora de `pagina.tsx` e `casco-de-autenticacao.tsx` |
| 2 | **uma só origem de largura** | `max-w-` de container fora de `pagina.tsx` (permitido em `max-w-sm`/`max-w-md` de conteúdo interno, lista explícita) |
| 3 | **a escala** | passo de espaçamento fora de `{0, 0.5, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, auto, px}` |
| 4 | **sem arbitrário de espaçamento** | `p-[…]`, `gap-[…]`, `m-[…]`, `space-y-[…]`, `w-[NNNpx]` |
| 5 | **sem fonte arbitrária** | `text-[…px]` |
| 6 | **uma moldura só** | `rounded-*` junto de `border` cru numa `className`, exceto `border-dashed` do `EstadoVazio` |
| 7 | **toda rota usa o casco** | rota de `src/app/(app)` cujos arquivos não mencionam `<Pagina` ou `<CascoDeAutenticacao` |

Mais uma regra de esqueleto, herdada do que já existe: **a variante declarada pela tela
(`<Pagina largura="estreita">`) tem de bater com a do `loading.tsx`** — hoje dois divergem
(§2.2). Isso substitui a comparação por string de `max-w-*`, que é frágil.

### 4.2 `src/lib/dominio/cores.test.ts` — a catraca

O irmão pode escrever `expect(paletaCrua).toBeNull()` porque tem **2** ocorrências. O WAP tem
**555 em 60 arquivos**. Um teste absoluto ficaria vermelho por semanas, e teste vermelho por
semanas é teste que se aprende a ignorar — que é o oposto do que este repositório faz.

**A catraca é a resposta honesta:** o teste guarda um **teto declarado** que só pode descer.

```ts
// O ORÇAMENTO DE COR CRUA. Este número é uma DÍVIDA, e a única direção
// permitida é para baixo. Baixou? Atualize aqui, no mesmo commit — é assim
// que o teto vira catraca em vez de enfeite. Subiu? O teste reprova, e a
// pergunta certa é "por que esta tela não usa um token de selo?".
const TETO_PALETA_CRUA = 555   // medido em 30/08/2026, antes da frente 0
const TETO_ARQUIVOS = 60
```

Três asserções:

1. **`src/lib/dominio.ts` não contém paleta crua nem hex** — essa vira `toBeNull()` **de
   verdade**, e é o coração: com `STATUS_META` e `STATUS_CHART_COLOR` em token, o vocabulário do
   sistema fica limpo mesmo enquanto as telas ainda não estão.
2. **A contagem global não sobe** (a catraca).
3. **Toda classe de `CLASSE_DA_FAMILIA` aponta para um token de selo existente em
   `globals.css`** — a trava TS↔CSS, no mesmo espírito das seis travas TS↔SQL que a casa já tem.

A frente 0 escreve as três; a asserção 1 fica **verde** ao fim da própria frente 0, e a catraca
desce a cada frente aplicada. A meta ao fim das cinco frentes é o teto **abaixo de 120** — o
resto é cor de `dev/`, `import/` e do wizard, que ficam para uma entrega própria.

### 4.3 Os pares novos no `contraste.mjs`

Dezoito pares novos (nove famílias × dois temas), medindo `selo-<familia>-texto` sobre
`selo-<familia>`. **Como as cores são as mesmas de hoje, as razões medidas têm de sair idênticas
às atuais** — e é isso que prova que a migração preservou a cor. Os pares de paleta crua
correspondentes (`green-800/green-100` etc.) **permanecem no arquivo**, marcados como referência,
até a frente que consumir cada família encerrar.

---

## 5. As frentes

Fundação primeiro, sozinha e verde. Depois as cinco frentes, com **arquivos disjuntos** — a mesma
disciplina que o irmão usou, e a razão de poderem ser executadas em sessões separadas.

| frente | arquivos | rotas |
| --- | --- | ---: |
| **0 · fundação** | `layout/pagina.tsx`, `aviso.tsx`, `cartao-de-metrica.tsx`, `casco-de-autenticacao.tsx`, `quadro-de-tabela.tsx`, `confirmacao-digitada.tsx`; extensão de `estado-vazio.tsx`; `globals.css` (só os tokens de selo + a regra de impressão); `lib/dominio.ts` (só as strings de classe); `lib/layout/consistencia.test.ts` + `lib/dominio/cores.test.ts`; 18 pares em `scripts/contraste.mjs` | 0 |
| **piloto · ativos** | `ativos/page.tsx`, `[id]/`, `novo/`, `loading.tsx`, `components/ativos/**` (sem os forms) | 3 |
| **a · acervo** | home, `pendencias/**`, `movimentacoes/**` (telas, não os forms) | 5 |
| **b · relatórios** | `relatorios/[filial]/`, `relatorios/gerados/**`, `components/relatorios/**` **exceto `acesso-form.tsx`** | 3 |
| **c · admin + itens** | os 9 painéis de `/admin` + `admin/layout.tsx` + ~~`itens/**`~~ **(a metade de itens saiu na F42 — ver abaixo)** | 11 → **8** |
| **d · dev, ajuda, versões, públicas** | `dev/**`, `ajuda/**`, `versoes/`, `login/`, `auth/**`, `relatorios/acesso/` + `components/relatorios/acesso-form.tsx` | 10 |

**A única fronteira que precisa ser escrita à mão:** `/relatorios/acesso` mora dentro de
`relatorios/**` mas é uma **porta de autenticação**, não um relatório — ela e o seu
`components/relatorios/acesso-form.tsx` pertencem à frente **d**, com as outras três portas, e ficam
explicitamente **fora** da frente b. Sem essa exceção escrita, as duas frentes tocariam o mesmo
arquivo e não poderiam rodar em sessões separadas. Soma: 3 + 5 + 3 + 11 + 10 = **32**.

**Por que `ativos` é o piloto:** é a rota com mais superfícies num lugar só (lista com filtro,
ficha, formulário de cadastro, tabela com ordenação, esqueleto) e a única com TanStack. Se o
sistema couber nela sem exceção, cabe no resto. Se não couber, o custo do erro é uma frente, não
seis.

> **A frente c avançou pela metade (F42, 31/08/2026).** A fase das telas de item não foi uma frente
> do sistema de design — foi uma fase de PRODUTO, do `docs/PLANO-ITENS.md` §6 — mas ela reescreveu
> `/itens` no casco e, junto, levou `/itens/conferencia` e a rota nova `/itens/historico`. Resultado:
> os prefixos `src/app/(app)/itens/` e `src/components/itens/` **saíram de `PENDENTES`** e as três
> rotas entraram em `ROTAS_MIGRADAS`. **88 violações em 30 testes viraram zero**, e a catraca de cor
> crua desceu de 479 para **473**.
>
> O que SOBROU da frente c: os **9 painéis de `/admin`** e o `admin/layout.tsx` — 8 rotas. Ele
> continua escrevendo o próprio `<h1>` e montando a barra de abas (`admin-nav.tsx`), que é o padrão
> de subnavegação que a frente vai ter de decidir se mantém, agora que existe o precedente dos
> subitens de menu (ata em `DECISOES.md`).
>
> Continuam pendentes, sem mudança: **a** (home, `/pendencias`, `/movimentacoes`), **b**
> (relatórios), o resto de **c** (`/admin`) e **d** (`/dev`, `/ajuda`, `/versoes`, as portas
> públicas e a casca do app). A lista `PENDENTES` **só encolhe** — foi o que aconteceu.

> **Os COMPONENTES das frentes b e c entraram na régua na F61 (17/09/2026).** A fase multiempresa
> precisava dos dois diretórios onde a UI de tenant vai nascer — `src/components/admin/` e
> `src/components/relatorios/` — sem isenção **por construção**: eles saíram de `PENDENTES` (que
> agora mora em `src/lib/layout/pendentes-da-regua.ts`, com catraca por conjunto nominal) e os **45
> arquivos** que a régua reprovava foram convertidos pela escala deste plano — 113 violações: texto
> arbitrário para `text-xs` (§3.4), espaçamento para a escala de §3.1 (empate sobe), moldura à mão
> para `QuadroDeTabela`/`Card`/`Aviso` (§3.8) e largura de célula pela escala. `SOB_REGRA` foi de 77
> para **154**, e a catraca de cor crua de 473 para **413** (61 → 53 arquivos).
>
> O `Aviso` ganhou a QUARTA intenção, `sucesso` (as duas caixas verdes escritas à mão do import e do
> teste de senha), com o par de tokens `--sucesso`/`--sucesso-texto` — mesmos valores do verde de
> antes, agora medidos em `npm run contraste` nos dois temas.
>
> **As ROTAS continuam pendentes**: `src/app/(app)/admin/` e `src/app/(app)/relatorios/` seguem em
> `PENDENTES` — 13 rotas sem casco (regra 7) e 4 esqueletos (regra 8) são o casco das frentes b e c,
> não da F61. E o `EstadoVazio` continua sem adoção nos cinco vazios de tabela do admin: a F61
> aplicou a regra de ESCALA (`py-10` → `py-12`) porque trocar o componente acrescentaria um ícone que
> aquelas telas não têm hoje. Detalhes em [`PLAN-F61.md`](PLAN-F61.md) e [`RELATORIO-F61.md`](RELATORIO-F61.md).

**Cada frente termina com** `npm run lint`, `npm run test`, `npm run build` e `npm run contraste`
verdes, a catraca de §4.2 abaixada no mesmo commit, e a conferência visual de §6.

---

## 6. Verificação

1. `npm run lint` · `npm run test` · `npm run build` · `npm run contraste` — os quatro verdes.
2. `git diff src/app/globals.css` **não altera nenhuma linha `oklch` pré-existente** — conferido
   por diff, não por leitura. As linhas novas são só as dos tokens de selo.
3. **A prova de que nenhuma cor mudou:** as razões dos 18 pares novos batem com as dos pares de
   paleta correspondentes, na mesma casa decimal, na saída de `npm run contraste`.
4. O teste de consistência (§4.1) verde — as sete regras.
5. A catraca (§4.2) verde, com o teto abaixado a cada frente.
6. **Conferência visual, tela a tela**, em `375`, `1280` e `1920`, nos dois temas: sem overflow
   horizontal, sem corte, cabeçalho e conteúdo alinhados, e a régua interno ≤ externo respeitada.
7. Foco por teclado e `prefers-reduced-motion` conferidos em ≥ 3 telas.
8. **Impressão do relatório** (`/relatorios/[filial]`, Ctrl+P): os quadros continuam desenhados no
   papel — é o item que a mudança para `Card` pode quebrar, e o `@media print` de §3.8 existe para
   isso. `impressao-colunas.test.ts` continua verde.
9. Revisão adversarial em contexto fresco: diff × este plano, olhando as telas.

### 6.1 O buraco desta verificação, dito com todas as letras

**Os itens 6 e 8 são manuais, e é a fraqueza real do plano.** O teste de §4.1 pega classe errada;
ele não pega elemento que muda de lugar sem mudar de classe. O irmão fechou esse buraco com
Playwright — 156 imagens por passada (26 rotas × 3 larguras × 2 temas), uma passada "antes"
congelada e uma por frente — e foi assim que ele descobriu, num monitor de 1920px, o defeito que
nenhuma das 104 imagens anteriores mostrava.

**O WAP não tem Playwright, e este plano não o adiciona** (a seção "Stack (fechada)" do
`CLAUDE.md` proíbe dependência nova sem aprovação registrada — e Playwright é MIT e R$ 0, então
quem o barra é a stack fechada, não a regra de custo). Duas saídas, e as duas são do dono:

- **Aprovar Playwright como devDependency** (MIT, R$ 0, só dev) e ganhar as fotos antes/depois.
  É o que eu recomendaria: o custo é um `npm i -D` e um script de ~120 linhas, e o retorno é a
  única classe de defeito que este plano não consegue provar sozinho.
- **Não aprovar**, e a conferência manual do item 6 vira parte do checklist de cada frente —
  32 rotas × 3 larguras × 2 temas por frente é caro, e é honesto dizer que provavelmente não será
  feito inteiro toda vez.

Decidir e registrar em [`DECISOES.md`](DECISOES.md) antes da frente 0. **Não travar por isso** —
o plano roda das duas formas; o que muda é o quanto ele consegue provar.

---

## 7. Linha de base (30/08/2026, antes da primeira mudança)

```
npm run lint       → 0 problemas, exit 0                        ← executado em 30/08/2026
npm run contraste  → exit 0; 85 pares na tabela, 73 exigidos    ← executado em 30/08/2026
npm run test       → 2.846 testes em 137 arquivos               ← SYSTEM-DESIGN-2026-08-30 §2.2
npm run build      → limpo na entrega da v1.44.2                ← CHANGELOG.md, não medido aqui
versão no ar       → 1.44.2 (package.json:3 e VERSOES[0] em registry.ts:26)
rotas              → 32 `page.tsx`
```

> **Honestidade sobre a linha de base:** `lint` e `contraste` foram rodados agora e são JavaScript
> puro. `test` e `build` **não** foram reexecutados nesta rodada; os números vêm dos documentos
> citados. Quem abrir a frente 0 **roda os quatro antes da primeira linha de código** e corrige esta
> tabela se algum divergir — linha de base que ninguém remede é folclore, e este repositório não
> trabalha assim. E note que `contraste` **não imprime resumo quando passa**: ele só escreve
> `N par(es) exigido(s) REPROVAM.` em stderr ao falhar. A prova de sucesso é o exit 0.

E os números que o plano promete mover:

| medida | hoje | meta ao fim das 5 frentes |
| --- | ---: | ---: |
| Classes de paleta crua | **555** em 60 arquivos | < 120 |
| Molduras `rounded-* border` à mão | **190** em 99 arquivos | 0 nas telas |
| `<h1>` escritos à mão | **19** | 0 (todos por `CabecalhoDaPagina`) |
| Rotas sem `<h1>` | **4** | 0 |
| Passos de espaçamento fora da escala (fora de `ui/`) | **51** | 0 |
| Fontes arbitrárias `text-[Npx]` | **49** | 0 |
| Larguras de campo `w-[NNNpx]` | **32** em 11 valores | 0 (classes da escala) |
| Convenções de altura de diálogo | **4** | 1 (`max-h-[calc(100svh-2rem)]`) |
| Estados vazios à mão | **23** + 8 sem moldura | 0 |
| Implementações de cartão de métrica | **5** | 1 |
| Anatomias de bloco de alerta | **≥ 8** | 3 intenções |
| Cópias da casca de autenticação | **4** | 1 |
| Consumidores de `var(--chart-N)` | **0** (5 tokens órfãos) | resolver: consumir ou remover |
| Pares exigidos no contraste | **73** (lista manual) | 91 (+18 de selo, e a fonte fechada) |

---

## 8. As decisões que ficam abertas — e cada uma tem um lado recomendado

Nenhuma delas trava a frente 0. Todas vão para [`DECISOES.md`](DECISOES.md) com data, contexto,
escolha, alternativas e motivo — e o plano segue com o padrão indicado até que se decida o
contrário.

| # | decisão | padrão do plano | por quê |
| ---: | --- | --- | --- |
| 1 | **Playwright** para as fotos antes/depois (§6.1) | **aprovar** | é a única classe de defeito que o plano não prova sozinho; MIT, dev-only, R$ 0 |
| 2 | **`mx-auto` nos três formulários** (§3.2) | **remover** (alinhar à esquerda) | uma linha vertical no produto inteiro; o irmão mediu o custo do contrário |
| 3 | **Separar tinta de área da tinta de texto** (§3.6) | **adiar**, com item novo na dívida | muda a cor dos gráficos e exige nova medição de ΔE sob daltonismo |
| 4 | **Os 5 `--chart-N` órfãos** (§1.4b) | **consumir** nos gráficos que hoje usam `var(--color-brand-*)` | token declarado e não consumido é dívida silenciosa; a alternativa honesta é removê-los |
| 5 | **Ritmo padrão `gap-6`** (§3.1) | **sim**, 24px | 9 rotas já usam; é o passo que o `--card-spacing` de 16px respeita pela regra interno ≤ externo |

---

## 9. Versionamento e encerramento (regra 8 do `CLAUDE.md`)

A entrega é uma **fase**, então **MINOR**: `1.44.2` → `1.45.0`. Três passos, sem exceção:

1. **bump** em `package.json` — só o campo `version`;
2. **entrada nova no topo** de `src/lib/versoes/registry.ts` com `versao`, `data`, `fase`,
   `titulo` e de 2 a 6 `mudancas` **em linguagem de operador** — rótulos reais das telas, o efeito
   antes da causa. Rascunho:
   - *"As telas passaram a ter o mesmo espaçamento e o mesmo título em todo o sistema."*
   - *"Os avisos amarelos e as mensagens de erro ficaram iguais em toda tela, com o mesmo tamanho
     e a mesma borda."*
   - *"As listas vazias passaram a mostrar sempre a mesma explicação, em vez de cada tela dizer de
     um jeito."*
   - *"As telas de entrada (login, definir senha, acesso ao relatório) ganharam título, o que
     ajuda quem usa leitor de tela."*
3. **tag anotada `v1.45.0`** no commit final, **publicada** (`git push origin v1.45.0`) — a regra 8
   do `CLAUDE.md` inclui a publicação, e parar antes dela é cumprir dois passos e meio.

Se a execução for partida em várias entregas (fundação numa, frentes noutras), **cada uma ganha a
sua versão** — a fundação é fase (`F40` → MINOR) e cada frente aplicada é entrega avulsa (PATCH),
pela mesma regra 8. `cobertura-changelog.test.ts` derruba o `npm run test` se uma entrada de
`CHANGELOG.md` ficar sem versão na mesma data; não é preciso lembrar da regra, basta não brigar
com ela.

**Ao terminar cada ordem:** `lint`, `test`, `build` e `contraste` limpos; checklist autoverificado
item a item; resumo final com checklist, decisões registradas em `DECISOES.md` e pendências.
