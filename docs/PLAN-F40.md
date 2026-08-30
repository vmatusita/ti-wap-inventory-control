# PLAN-F40 — sistema de design: fundação + piloto `/ativos`

Plano de execução da ordem [`docs/prompts/F40-design-system-ultracode.md`](prompts/F40-design-system-ultracode.md),
derivado de [`docs/PLANO-DESIGN-SYSTEM.md`](PLANO-DESIGN-SYSTEM.md) (§§3–5). Escrito em 30/08/2026,
autossuficiente: quem ler este arquivo executa e revisa a entrega sem a conversa que a originou.

**Régua de decisão** (da ordem): (1) a ordem; (2) o plano; (3) `CLAUDE.md`; (4) o código existente;
(5) a opção mais simples e reversível.

---

## 0. Linha de base revalidada (30/08/2026, antes da primeira mudança)

Os quatro comandos foram executados na `main` limpa, no commit `0ea3fed`, antes de qualquer edição:

| medida | plano §7 diz | medido agora | veredito |
| --- | ---: | ---: | --- |
| `npm run lint` | 0 problemas, exit 0 | exit 0 | ✅ confere |
| `npm run contraste` | exit 0, 85 pares / 73 exigidos | exit 0, 85 pares | ✅ confere |
| `npm run test` | 2.846 testes em **137** arquivos | 2.846 testes em **140** arquivos | ⚠️ **diverge** (arquivos) |
| `npm run build` | limpo | exit 0 | ✅ confere |
| classes de paleta crua | 555 em 60 arquivos | 555 em 60 | ✅ |
| molduras `rounded-* border` | 190 em 99 arquivos | 190 em 99 | ✅ |
| `<h1>` à mão | 19 | 19 (a varredura ingênua dá 22 — 3 são **comentários**) | ✅ |
| passos fora da escala | 51 | 51 | ✅ |
| `text-[Npx]` | 49 | 49 | ✅ |
| `border-dashed` à mão | 23 | 23 | ✅ |
| `w-[NNNpx]` | 32 | 32 | ✅ |
| consumidores de `var(--chart-N)` | 0 | 0 | ✅ |
| rotas (`page.tsx`) | 32 | 32 | ✅ |
| versão no ar | 1.44.2 | 1.44.2 | ✅ |

**Nenhuma falha pré-existente.** A única divergência é o número de ARQUIVOS de teste (137 → 140);
o número de testes bate. O plano é corrigido na mesma entrega.

**Os 3 `<h1>` a mais** são a prova antecipada de por que `consistencia.test.ts` tem de remover
comentários antes de casar: `admin/importar/page.tsx:40`, `relatorios/gerados/[id]/page.tsx:15` e
`relatorios/[filial]/page.tsx:35` **citam** `<h1>` em prosa.

---

## 1. Etapa 1 — a FUNDAÇÃO (nenhuma tela migrada)

### 1.1 `src/components/layout/pagina.tsx` (novo)

```ts
export const LARGURAS = { estreita: 'max-w-3xl', cheia: '' } as const
export type LarguraDaPagina = keyof typeof LARGURAS
export const MEDIDA_DE_FORMULARIO = 'max-w-3xl'

export function Pagina({ largura = 'cheia', className, children })       // flex w-full min-w-0 flex-col gap-6 + LARGURAS[largura]
export function CabecalhoDaPagina({ titulo, descricao, acoes, ajuda, ajudaRotulo, aoLado, className })
export function SecaoDaPagina({ titulo, descricao, acoes, className, children })
```

- `Pagina` **não tem padding** (é do `(app)/layout.tsx`, `p-4 md:p-6`, que §1.1 do plano mediu certo)
  e **não centraliza** (decisão 2 do Johnny). É a única origem de `max-w-*` de container.
- Atributo `data-casco-da-pagina={largura}` — gancho para a conferência por screenshot e para o
  teste de esqueleto.
- `CabecalhoDaPagina` **absorve o `LinkAjuda`** (prop `ajuda` = slug do registry): é a origem das 5
  variantes de gap do achado 2. Anatomia de §3.3, literal.
- `titulo: React.ReactNode` — é o que preserva o `tabular-nums` do patrimônio em `/ativos/[id]`.
- `aoLado?: React.ReactNode` — o que fica NA LINHA do título e não é o `LinkAjuda`
  (`CopiarPatrimonio`, `StatusBadge` da ficha). Sem ele, a ficha teria de escrever `<h1>` à mão.
- `LARGURAS.estreita` é `max-w-3xl` (768px) e **não** `max-w-2xl` como no irmão: as duas rotas de
  ajuda do WAP já usam `max-w-3xl` hoje, e o plano §3.2 escreve `max-w-3xl`.

### 1.2 Os outros componentes de sistema (novos)

| arquivo | exporta | anatomia |
| --- | --- | --- |
| `layout/aviso.tsx` | `Aviso`, `IntencaoDoAviso` | `rounded-lg border p-3 text-sm` · erro `role="alert"` · atenção/informação `role="status"`/sem papel. Cores de §3.6 do plano. |
| `layout/cartao-de-metrica.tsx` | `CartaoDeMetrica`, `GradeDeMetricas` | `<Card size="sm">` · rótulo `text-muted-foreground text-xs` em cima, valor `text-2xl font-semibold tabular-nums` embaixo. Variantes estático / `href` / `onClick`. |
| `layout/casco-de-autenticacao.tsx` | `CascoDeAutenticacao` | as 4 portas, com `<h1>` de verdade. **CRIADO e NÃO APLICADO** — a aplicação é da frente d. |
| `layout/quadro-de-tabela.tsx` | `QuadroDeTabela` | `<Card className="py-0">` — a moldura da tabela. |
| `layout/confirmacao-digitada.tsx` | `ConfirmacaoDigitada` | rótulo + `<Input>` + o texto exigido em `<code>`; função pura `confirmacaoBate`. |

### 1.3 `layout/estado-vazio.tsx` (extensão, sem quebrar os 12 usos)

`acao?: { href: string; rotulo: string } | React.ReactNode` — e `descricao?: React.ReactNode`.
Discriminação por `ehAcaoDeLink()` (objeto com `href` e `rotulo` string). Os 12 usos atuais passam
objeto literal ou `undefined`; nenhum muda.

### 1.4 Os tokens de cor — `src/app/globals.css`

**As NOVE famílias de selo** são as nove combinações de paleta crua que `dominio.ts` usa hoje:

| família | claro (fundo / texto) | escuro (fundo / texto) | quem usa |
| --- | --- | --- | --- |
| `em-estoque` | `green-100` / `green-800` | `green-950` / `green-300` | `STATUS_META.em_estoque` + `TIPO_PILL.compra` |
| `reservado` | `violet-100` / `violet-700` | `violet-950` / `violet-300` | `STATUS_META.reservado` |
| `em-uso` | `blue-100` / `blue-700` | `blue-950` / `blue-300` | `STATUS_META.em_uso` + `TIPO_PILL.devolucao` |
| `emprestado` | `cyan-100` / `cyan-700` | `cyan-950` / `cyan-300` | `STATUS_META.emprestado` |
| `em-triagem` | `pink-100` / `pink-700` | `pink-950` / `pink-300` | `STATUS_META.em_triagem` |
| `em-manutencao` | `amber-100` / `amber-800` | `amber-950` / `amber-300` | `STATUS_META.em_manutencao` + `TIPO_PILL.saida` |
| `descartado` | `gray-200` / `gray-600` | `gray-800` / `gray-400` | `STATUS_META.descartado` + `PILL_NEUTRA` |
| `devolvido-fornecedor` | `slate-200` / `slate-700` | `slate-800` / `slate-300` | `STATUS_META.devolvido_fornecedor` |
| `troca` | `teal-100` / `teal-700` | `teal-950` / `teal-300` | `TIPO_PILL.troca` |

`STATUS_META.defasado` continua em `bg-muted text-muted-foreground` — já é token, não entra.

**36 valores oklch, copiados de `node_modules/tailwindcss/theme.css`.** Nenhuma linha `oklch`
pré-existente é tocada — só se acrescenta. Cada token leva o nome da classe de origem no comentário.

**`@theme inline` ganha os apelidos** `--color-selo-<familia>` e `--color-selo-<familia>-texto`,
que é o que faz `bg-selo-em-estoque` / `text-selo-em-estoque-texto` existirem no Tailwind v4.

**Impressão:** dentro do `@media print` que já existe, `[data-slot='card']` ganha
`border: 1px solid #e5e5e5` — o `Card` desenha o traço com `ring-1` (box-shadow) e o navegador
descarta box-shadow no papel.

### 1.5 Os `--grafico-<familia>` — e a divergência da decisão 4

A decisão 4 da ordem manda os `--grafico-<familia>` nascerem "como apelido de
`--selo-<familia>-texto`, **sem mudar nenhuma cor**". **As duas metades não podem ser verdade ao
mesmo tempo**, e isto foi medido: `STATUS_CHART_COLOR.em_estoque` é `#16a34a` = `green-600`,
enquanto `--selo-em-estoque-texto` é `green-800`. Apelidar mudaria a cor de cinco superfícies
(acento do KPI tile, barra do acervo, segmento empilhado, série temporal, swatch do glossário) —
exatamente o que o critério 2 da ordem trata como **bloqueante**.

**Escolha:** vale a metade que a ordem chama de bloqueante. Os `--grafico-<familia>` nascem com o
**valor que a tinta de gráfico tem hoje**, hex por hex, e `STATUS_CHART_COLOR` passa a apontar para
eles (`var(--grafico-em-estoque)`). Zero cor muda; o terreno fica pronto do mesmo jeito — separar
as tintas um dia é editar uma linha de `globals.css`, que é o que a decisão 3 do plano §8 queria.

**Consequência obrigatória:** a ARMADILHA de `dominio.ts:108-110` — `fillRotuloSegmento` só sabe
converter hex e os tokens de `TOKEN_PARA_HEX`. Os 9 tokens novos entram lá, e um teste espelha
`TOKEN_PARA_HEX` ↔ `globals.css` (no espírito das seis travas TS↔SQL da casa).

### 1.6 `src/lib/dominio.ts` — só as strings de classe

`STATUS_META`, `TIPO_PILL`, `PILL_NEUTRA` e `STATUS_CHART_COLOR` deixam de escrever paleta e hex.
Classes **por extenso**, nunca por template (o Tailwind v4 varre nome literal no fonte). Rótulos,
ordens, funções e comentários históricos ficam.

### 1.7 `scripts/contraste.mjs` — 18 pares novos

9 famílias × 2 temas, medindo `selo-<familia>-texto` sobre `selo-<familia>`, `px: 11`,
`exigir: true`. Os pares de paleta crua correspondentes **permanecem** (§4.3 do plano). A prova do
critério 2 é a razão nova bater com a antiga na mesma casa decimal.

### 1.8 `src/lib/layout/consistencia.test.ts` (novo)

Molde de `sidebar-colapso.test.ts`: lê texto-fonte, ambiente `node`, zero dependência.
Sete regras + a de esqueleto, com **comentários removidos antes de casar** (parser
caractere-a-caractere, comentário vira espaço para preservar o número da linha).

| # | regra | reprova quando |
| ---: | --- | --- |
| 1 | um só `<h1>` | `<h1` fora dos arquivos do SISTEMA |
| 2 | uma só origem de largura | `mx-auto` **+** `max-w-*` no MESMO `className` fora do SISTEMA |
| 3 | a escala | passo fora de `{0,0.5,1,1.5,2,3,4,6,8,12,16,auto,px}` |
| 4 | sem arbitrário de espaçamento | `p-[…]`, `gap-[…]`, `m-[…]`, `space-y-[…]`, `w-[NNNpx]` |
| 5 | sem fonte arbitrária | `text-[Npx]` |
| 6 | uma moldura só | `rounded-{sm..3xl}` junto de `border` cru |
| 7 | toda rota usa o casco | rota de `(app)` sem `<Pagina` nem `<CascoDeAutenticacao` |
| 8 | esqueleto casa com a tela | `largura` do `<Pagina>` ≠ a declarada no `loading.tsx` |

**Três definições que o irmão já pagou para aprender e que herdamos:**

- **`rounded-full` não é moldura.** `temRaio` casa `rounded`, `rounded-sm..3xl` — não `rounded-full`.
  Pastilha, ponto de trilho e avatar são geometria de chip, não cartão. Os números do achado 6
  separam os dois: 187 raios de moldura contra 3 `rounded-full`.
- **`className` partido em duas strings escapa regra de combinação.** As regras 2 e 6 leem o
  `className` INTEIRO (`cn('...', 'mx-auto', x && 'max-w-6xl')` passava 100% verde no irmão).
- **`env(safe-area-inset-*)` não é passo de espaçamento.** É um inset de aparelho sem equivalente
  na escala (`pb-[max(0.75rem,env(safe-area-inset-bottom))]`, `barra-selecao-ativos.tsx`).

**A lista de exceções `PENDENTES`.** Por prefixo de diretório, agrupada POR FRENTE do plano §5.
Cada frente seguinte apaga as suas linhas; a lista **só encolhe**. Tudo que não está nela está sob
as regras — inclusive arquivo novo, que assim nasce coberto em vez de escapar por omissão.

### 1.9 `src/lib/dominio/cores.test.ts` (novo) — a catraca

⚠️ O caminho cria um **diretório `src/lib/dominio/` ao lado do arquivo `src/lib/dominio.ts`**.
Não há colisão hoje (o arquivo ganha do diretório na resolução), mas 146 arquivos importam
`@/lib/dominio`: a etapa 1 só fecha depois de `lint`, `test` e `build` verdes com o diretório
criado. Se algum quebrar, o arquivo vira `src/lib/dominio-cores.test.ts` e a divergência é
registrada.

Três asserções, como §4.2:

1. `dominio.ts` não contém paleta de fábrica **nem hex** — `toBeNull()` de verdade.
2. A contagem global não sobe — a catraca, com `TETO_PALETA_CRUA` **abaixado no mesmo commit**.
3. Toda classe de selo escrita em `dominio.ts` aponta para um token que existe em `globals.css`,
   nos DOIS temas, e tem apelido no `@theme inline` — a trava TS↔CSS.
   Mais: `TOKEN_PARA_HEX` de `rotulo-grafico.ts` espelha os 9 `--grafico-*` do CSS.

---

## 2. Etapa 2 — o PILOTO (`/ativos`), só depois da fundação verde

| arquivo | o que muda |
| --- | --- |
| `ativos/page.tsx` | `space-y-5` → `<Pagina>` (`gap-6`); cabeçalho à mão → `<CabecalhoDaPagina>` |
| `ativos/loading.tsx` | `space-y-5` → `space-y-6`; moldura à mão → `<Card className="py-0">`; `data-casco-da-pagina="cheia"` |
| `ativos/[id]/page.tsx` | `<Pagina>` + `<CabecalhoDaPagina titulo={…tabular-nums} aoLado={…}>`; 3 molduras à mão → `Card`/`Aviso`; `p-2.5` → `p-3`; `gap-x-5` → `gap-x-6` |
| `ativos/[id]/loading.tsx` | `data-casco-da-pagina="cheia"` |
| `ativos/novo/page.tsx` | `mx-auto max-w-3xl` → `<Pagina>` cheia + `MEDIDA_DE_FORMULARIO` no contêiner dos campos |
| `ativos/novo/loading.tsx` | `max-w-3xl space-y-5` → `space-y-6` + `data-casco-da-pagina="cheia"`; moldura → `Card` |
| `ativos-table.tsx` | moldura → `<QuadroDeTabela>` |
| `ativos-filtros.tsx` | `w-[150px]` → `w-40` |
| `ativos-paginacao.tsx` | `w-[140px]` → `w-36` |
| `barra-selecao-ativos.tsx` | moldura → `Card`, mantendo `sticky` e a `env(safe-area-inset)` |
| `estornar-dialog.tsx` | `rounded-md border bg-muted/40 p-3` → `Card size="sm"` |
| `linha-do-tempo.tsx` | vazio à mão → `EstadoVazio`; 3 `text-[11px]` → `text-xs`; `py-10` → `py-12`; molduras → `Card`; callout âmbar → `Aviso` |
| `pendencias-item-ficha.tsx` | 2 molduras → `Aviso` + `Card` |
| `termos-da-ficha.tsx` | moldura → `Card`; `<p>` solto → `EstadoVazio` inline |
| `itens-que-foram-junto.tsx` | conferir (já usa `Card`) |
| `status-badge.tsx` | nada (a cor vem de `dominio.ts`) |

**Fora:** `nova-compra-form.tsx` (1.412 linhas, 30 `useState`).

**Riscos mapeados, e o que fazer com cada um:**

- **`sticky` da barra de seleção** — `position: sticky` morre dentro de ancestral com `overflow`.
  `Pagina` é `flex flex-col`, sem `overflow`; **o `Card` do kit tem `overflow-hidden`**, então a
  barra NÃO vira `Card`: ela recebe a moldura por composição (`Card` só se o teste provar que o
  sticky sobrevive). Conferir na etapa de verificação.
- **`scroll-mt-20` da timeline** — compensa o header fixo; nada nesta ordem muda a altura do header.
- **`print:hidden`** — tudo continua CSS puro; nenhuma classe de impressão é reescrita.
- **`EstadoVazio` `py-16` dentro de `Pagina`** — `Pagina` não tem padding, então não duplica.

---

## 3. Fora de escopo (declarado)

`supabase/migrations/`, `src/lib/actions/`, `src/lib/queries/`, `src/lib/validators/`,
`src/proxy.ts`, `src/lib/types/database.ts`, `src/components/ui/`,
`src/components/ativos/nova-compra-form.tsx`, e as frentes a/b/c/d (home, pendências,
movimentações, relatórios, admin, itens, dev, ajuda, versões, telas públicas).
`CascoDeAutenticacao` é criado e **não aplicado**.

Nenhuma cor renderizada muda. Nenhum texto de tela muda. Nenhuma regra de negócio muda.
Nenhuma dependência nova além do Playwright (aprovado).

---

## 4. Verificação de ponta a ponta

1. `npm run lint` · `npm run test` · `npm run build` · `npm run contraste` — os quatro, **após cada
   incremento**, não só no fim.
2. `git diff src/app/globals.css` não altera nenhuma linha `oklch` pré-existente — conferido por
   diff (`git diff -U0 … | grep '^-'`), não por leitura.
3. As razões dos 18 pares novos batem com as dos pares de paleta correspondentes, na mesma casa
   decimal (`npm run contraste` + `--par` para os que não estão na lista).
4. `consistencia.test.ts` verde com as 3 rotas de `/ativos` FORA da lista de exceções.
5. `cores.test.ts` verde, com o teto abaixado e escrito no mesmo commit.
6. Screenshots antes/depois — **ou** a pendência registrada, se não houver banco de ensaio
   (a regra 2 do `CLAUDE.md` proíbe fotografar produção).
7. Revisão adversarial em contexto fresco: diff × este plano × §§3–4 do plano × os 10 critérios.
   Cor que mudou é **bloqueante**.
8. Versão 1.45.0: `package.json`, `registry.ts`, `CHANGELOG.md`, tag `v1.45.0` publicada.
