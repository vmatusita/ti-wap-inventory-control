# PLAN v1.71.1 + v1.71.2 — Reservados por categoria · o colaborador que sobra do estorno

Ordem: [`prompts/prompt-reservados-por-categoria-e-colaborador-sem-uso.md`](prompts/prompt-reservados-por-categoria-e-colaborador-sem-uso.md).
Duas entregas avulsas (PATCH, regra 8), cada uma com o seu PR. Escrito em 19/10/2026, antes do primeiro commit que
toca `src/`, `supabase/` ou `scripts/`. As decisões marcadas **D1…D14** viram ata em [`DECISOES.md`](DECISOES.md).

## 0. Estado de partida, medido nesta run

- `main` em `47344c9`, tag `v1.71.0` no HEAD, `package.json` em `1.71.0`, última migration `0179`, só o arquivo da
  ordem fora do git. Linha de base da mesa: `npm run test` → **259 arquivos, 8.036 testes verdes** (3 min 38 s).
- **O mapa do `CLAUDE.md` bate com o disco**: os 25 diretórios de `src/lib`, os 12 de `src/components` (o mapa não os
  enumera) e os 14 `CLAUDE.md` aninhados da lista. Nenhuma parada.
- **O canal do banco não existe nesta sessão.** O conector da Supabase está ligado, mas numa conta em que o único
  projeto visível é um terceiro (`prod`, que não é da WAP). `execute_sql` em `sgmvldiizsrjbxzzpmhh` (ensaio) e em
  `pbtjcalbmepmrqzprusb` (produção) responde `You do not have permission to perform this action`, da sessão principal
  e dos cinco subagentes. Nada foi tentado no projeto alheio. **Consequência, pela própria ordem (§Autonomia):** a
  Frente A sai inteira (não tem migration); a Frente B sai com o PR aberto e **sem merge**, com o caminho B (o SQL, a
  ordem do apply e a sonda) no topo do relatório. **D1.**

### 0.1 Os 15 fatos, reconferidos

| Fato | Resultado | Evidência / divergência |
|---|---|---|
| 1 | confere | `47344c9`, `v1.71.0`, `0179`. |
| 2 | confere | `lista-reservados.tsx:6-27`; usos em `corpo-relatorio-v2.tsx:260-268` e `corpo-relatorio.tsx:170-176`. O card ocupa meia coluna (`md:grid-cols-2`). |
| 3 | confere | `estoque.ts:428-449` descarta `categoria`; o MESMO `estado` alimenta `kpisDeEstado` (`snapshot.ts:138,158`). |
| 4 | confere | `tipos.ts:30`; `ITEM_RESERVADO` em `relatorios-gerados.ts:62` é `looseObject` (aceitaria a chave nova calado, mas a forma tem de espelhar o tipo campo a campo — `relatorios-gerados-tipos.test.ts`). |
| 5 | confere | `lista-modelo-categoria.tsx:15-24`. |
| 6 | **não confere** | `lista-reservados.tsx` está em `SOB_REGRA_CONGELADA` (`pendentes-da-regua.ts:483`), não em `PENDENTES` — a F61 já o converteu, e `PENDENTES` não pode ter nada de `src/components/relatorios/`. Não há linha a tirar; o arquivo reescrito continua sob a régua (os detectores reais dão zero achado hoje). **D2.** |
| 7 | confere, incompleto | Além de spec §7 item 2 (`ESPECIFICACAO.md:301`), `relatorio-ao-vivo.ts:60` e `entregar-emprestar-reservar.ts:97`, o card é citado em `entregar-emprestar-reservar.ts:104` e `:114` (este com o subtítulo antigo). Os quatro pontos são emendados. |
| 8 | confere | `campo-colaborador.tsx:99-131` → `criarColaboradorInline` (`actions/colaboradores.ts:95-178`). O rascunho do wizard guarda só o texto; nada desfaz o cadastro. |
| 9 | confere | `0112` (sem DELETE, UPDATE por `e_admin()`); FKs `colaborador_id` hoje COMPOSTAS com `empresa_id` (`0166`); unique por empresa (`0172`/`0174`). |
| 10 | **parcial** | A última definição de `estornar_movimentacao_com_itens` é a **`0122`** (`:169-268`), não a `0161` (que só a cita em comentário). A linha `estorno` não grava colaborador (`0122:217-220`); os inversos copiam o que vier no payload — a regra "sem saldo vai sem vínculo" é decidida no TypeScript (`actions/movimentacoes.ts:731-761`). Nenhuma função toca `colaboradores`. **D3.** (Lido do disco; o corpo vivo não pôde ser lido — D1.) |
| 11 | confere | `queries/colaboradores.ts:91-127` (embed `movimentacoes(count)`, `lancamentos_item(count)`); `colaboradores-tabela.tsx:125-160`. |
| 12 | confere | `queries/colaboradores.ts:334` (`ativo = true`); `jaCadastrado` em `:441`. |
| 13 | confere no código; **contagem pendente** | A consolidação cria cadastro a partir do texto, sem tocar histórico. A contagem real (quantos cadastros sem vínculo por id são salvos pela chave) é medida pela leitura do app — §3.6 — porque o SQL não tem canal (D1). |
| 14 | **parcial** | `rel_saldo_colaborador` é **função** (`0118:89-115`, `rel_saldo_colaborador(p_colaborador uuid)`), não view; a `0120` só cria um índice. **D3.** |
| 15 | confere | lição do teto de 1.000. |

**Fatos novos que mudam o plano:**

- **N1 — a trava 7c (`supabase/tests/empresa_no_acervo.sql:552-556`) reprova toda VIEW de `public` que cite
  `empresa_id` junto de uma das oito tabelas do acervo, sem lista de exceção.** Uma view que case a pessoa "na mesma
  empresa" não passa. A forma sancionada desde a F66 para ler `empresa_id` fora de policy é **função `security
  invoker` com entrada nominal em `k_leitura_tenant`** (`catalogo_policies.sql:157-163`; precedentes
  `rel_por_motivo_filiais` e `rel_resumo_filiais`, "integridade de junção, não recorte"), conferida POR COMANDO pela
  15h, com as tabelas da entrada. **D4.**
- **N2 — o injetor não alcança corpo de view** (`corpo-vigente.mjs` só resolve função; a única mutação de corpo de view
  está em quarentena por isso). Uma função é mutável por `mutarFuncao`. Mais um motivo para D4.
- **N3 — `v_colaboradores_textos` (0144) não separa empresa** no join com `colaboradores`. É anterior a esta ordem e
  não muda nada hoje (uma empresa). Vai para o backlog do relatório (regra 1).

## 1. Frente A — v1.71.1, os Reservados por categoria (sem migration)

### 1.1 Dado

- `src/lib/relatorios/tipos.ts`: `ItemReservado` ganha `categoria?: CategoriaAtivo` (OPCIONAL, mantém `schema: 2`,
  precedentes `emprestado?`, `serieEstado?`, `movimentacoesItens?`).
- `src/lib/queries/formas/relatorios-gerados.ts`: `ITEM_RESERVADO` ganha `categoria: ENUM.categoriaAtivo.optional()`.
- `src/lib/queries/relatorios/estoque.ts`: `reservadosDeEstado` preenche `categoria: a.categoria` do `EstadoAtivo` que
  já está em memória. **Zero leitura nova.** A montagem da lista sai para uma função pura exportada
  (`itensReservadosDeEstado(estado, dados, chamados)`), testável com fixture e sem client; `reservadosDeEstado` só faz as
  duas leituras de sempre e a chama. **D5.**

### 1.2 Função pura — `src/lib/relatorios/reservados.ts` (arquivo novo)

```ts
export type GrupoReservados = { categoria: CategoriaAtivo; itens: ItemReservado[]; total: number }
export type ReservadosAgrupados = { total: number; grupos: GrupoReservados[] | null } // null = sem grupos
export function agruparReservados(itens: readonly ItemReservado[]): ReservadosAgrupados
export function rotuloReservados(n: number): string // "1 reservado" | "N reservados" (toLocaleString pt-BR)
```

- **Ordem dos grupos = `CATEGORIA_ORDEM`** (`src/lib/dominio.ts:289`), a MESMA que `disponiveisPorModeloDeEstado` usa no
  card vizinho (`estoque.ts:336`) e que `categoriaDeEstado`/`estoqueCatStatusDeEstado` usam no mesmo relatório. Não é a
  ordem do enum do banco (diferente) nem a de `CATEGORIA_META`.
- Dentro do grupo, por patrimônio (`localeCompare` pt-BR), como hoje.
- **Se QUALQUER item vier sem `categoria`** (snapshot antigo), `grupos: null`. Lista vazia → `{ total: 0, grupos: [] }`.
- Categoria fora de `CATEGORIA_ORDEM` (não existe hoje — `dominio.test.ts` prova a cobertura) entra no fim, para o total
  nunca divergir da soma dos grupos.

### 1.3 O card — `src/components/relatorios/lista-reservados.tsx` (reescrito, Server Component)

- **Subtítulo** (nos dois corpos): `rotuloReservados(s.reservados.length)` no lugar de "patrimônio · modelo · nº do
  chamado". Igual ao `kpis.reservado` do mesmo relatório por construção (§1.5).
- **Com grupos:**
  - chips `"<Categoria> N"` (o `rotuloCategoria` do vizinho) **só com 2 categorias ou mais**, numa `<ul>` com
    `aria-label="Reservados por categoria"`; cada chip é `<li>` com `<span>`, **sem `href`, sem `onClick`, sem âncora**;
    estilo do `ChipsResumo` (`rounded-full bg-muted px-3 py-0.5 text-xs`, número `font-semibold tabular-nums`, texto na
    cor padrão — o par `text-muted-foreground`/`bg-muted` está RECUSADO no `contraste.mjs`), visível na impressão;
  - um bloco por grupo no molde de `lista-modelo-categoria.tsx`: cabeçalho `flex items-baseline justify-between` com
    `<h4>` do rótulo à esquerda e `rotuloReservados(g.total)` à direita; embaixo as linhas de hoje
    (patrimônio · modelo · #chamado);
  - **impressão:** o cabeçalho do grupo leva `break-after-avoid` e cada linha `break-inside-avoid` — o cabeçalho nunca
    fica sozinho no pé da página. (O card inteiro já é `break-inside-avoid`, `card-relatorio.tsx:62`.)
- **Sem grupos (snapshot antigo e todo snapshot v1):** a lista corrida de hoje, sem chips e sem grupos, sem ler banco.
- A chave do `<li>` deixa de ser `patrimonio + modelo` (repete quando o patrimônio é "—" e o modelo coincide): passa a
  `patrimônio + modelo + índice`.
- **Só classes literais**, todas na escala da régua (`space-y-*`, `gap-*`, `px-3`, `py-0.5`, `text-xs`).

### 1.4 Onde vale

`CorpoRelatorioV2` (ao vivo de filial, `/relatorios/geral`, snapshots v2 novos e antigos, visualizador por senha,
impressão — todos pela mesma grade) e `CorpoRelatorioV1` (snapshots pré-F3B: sempre sem categoria → lista corrida).
Nenhuma prop de link chega ao card: o visualizador por senha nunca ganha `href` (`confinamento-viewer.test.ts`
continua verde sem exceção nova).

### 1.5 O total × o tile

`kpis.reservado` conta `status === 'reservado'` fora das duas baixas (`kpisDeEstado`), e `reservadosDeEstado` filtra o
MESMO `estado` por `status === 'reservado'`, 1:1 (o `reservado` nunca é baixa). No v2 os dois números são iguais por
construção, nos quatro caminhos (filial, consolidado, fast path, as-of). O tile "Reservados" do grupo "Equipamentos
principais" lê o mesmo `s.kpis.reservado` (`kpi-tiles.tsx:198,217`). Nos snapshots v1 o motor que os gerou não existe
mais; o subtítulo do v1 mostra o tamanho da lista congelada, e qualquer divergência histórica lá seria do snapshot, não
do card (D6, registrada sem medição de banco — D1).

### 1.6 Testes (A5)

- `src/lib/relatorios/reservados.test.ts` (projeto `puro`): vazio, 1 categoria, várias (ordem = `CATEGORIA_ORDEM`,
  itens por patrimônio), item sem categoria → `null`, singular/plural e milhar (`1.234 reservados`), soma dos grupos =
  total.
- `src/lib/queries/relatorios/estoque.test.ts`: fixture de `EstadoAtivo` com reservados de 3 categorias + outros
  status + as duas baixas → `itensReservadosDeEstado` grava `categoria`, e `agruparReservados(...).total ===
  kpisDeEstado(estado).reservado` === soma dos grupos (A1).
- `src/components/relatorios/lista-reservados.test.tsx` (grau 1, `renderToStaticMarkup`): com grupos (cabeçalhos na
  ordem, "N reservados" à direita, chips só com ≥2 categorias e números iguais aos cabeçalhos, nenhum `<a`/`href`,
  `break-after-avoid` no cabeçalho) e sem grupos (lista corrida, sem chips, sem cabeçalho).
- `src/lib/queries/formas/relatorios-gerados.test.ts`: snapshot v2 e v1 sem `categoria` passam; v2 com `categoria`
  passa e a preserva; `categoria` inválida reprova. A4 ponta a ponta: o snapshot novo vai por `JSON.stringify` →
  `JSON.parse` → forma → `agruparReservados` → grupos; o antigo → `grupos: null` → lista corrida.

### 1.7 Prova fotografada (A6) — `docs/v1.71.1-evidencias/`

Prévia estática nova `scripts/design/previa-v1711.tsx` (molde da F61: componentes REAIS, `renderToStaticMarkup`, CSS do
app compilado por `@tailwindcss/postcss`, Playwright em `file://`), com dado 100% fictício (`WAP0001234`, "Fulano"): o
card **antes** (o componente da `main`, gravado na primeira rodada) e **depois** (grupos com chips; uma categoria só;
snapshot antigo), temas claro e escuro, larguras 1366 e 390 (com `scrollWidth ≤ clientWidth` medido em 390) e uma
captura com `emulateMedia({ media: 'print' })`. `varrer-evidencias` sobre a pasta com **0 ocorrência**.

### 1.8 Documentos e versão

Spec §7 item 2 (emenda datada); ajuda `relatorio-ao-vivo.ts` (o card) e `entregar-emprestar-reservar.ts` (`:97`, `:114`);
ARQUITETURA §10 (linha nova: o card e a função pura); ata; CHANGELOG + `1.71.1` + `registry.ts` + tag `v1.71.1`.

## 2. Frente B — v1.71.2, o colaborador sem uso

### 2.1 B1 — o diagnóstico por execução: `supabase/tests/colaborador_estorno.sql`

Roteiro NOVO (não a extensão do `f37_…`, que roda como dono, sem RPC nem estorno: o cenário pede as RPCs reais da
movimentação e do estorno, que são as do `f38_…`). Verde desde o primeiro push: ele AFIRMA o comportamento de hoje.

Cenários (sessão simulada por `request.jwt.claims`, operador plantado por `pg_temp.plantar_cargo`, grants de tabela no
topo — o CI não os tem):

- **(i-a) cadastro inline → saída sem item → estorno**; **(i-b) cadastro inline → saída com 1 item junto → estorno com o
  inverso** (o payload de `planejarEstorno`: `saida` → `retorno`, mesmo `colaborador_id`); **(ii) cadastro inline e
  formulário abandonado** (o INSERT do clique e nada mais).
- Depois de cada caminho, afirma: `colaboradores.ativo` segue `true`; a movimentação original guarda o `colaborador_id`;
  a linha `estorno` existe com `estorno_de` e SEM `colaborador`/`colaborador_id`; o inverso de item guarda o
  `colaborador_id`; o ativo voltou a `em_estoque` com `colaborador_atual` nulo (o detentor restaurado é o de antes);
  `rel_saldo_colaborador(pessoa)` vem vazio; as contagens que "Registros" lê (`movimentacoes` e `lancamentos_item` com o
  id: 1 e 0 em i-a; 1 e 2 em i-b; 0 e 0 em ii); a consulta do campo (`ativo = true` e `nome_chave like '%chave%'`)
  ainda acha a pessoa; `v_colaboradores_textos` tem o grupo da chave com `ja_cadastrado = true` (i) e não tem grupo
  (ii).

O mapa das outras superfícies (relatório, termo, pendências de item, "Com esta pessoa", ficha, `/movimentacoes`) é
por leitura de código e vai como tabela no topo do relatório.

### 2.2 B3 — a regra do uso efetivo, por extenso

Um cadastro tem **uso efetivo** quando existe pelo menos UM registro da **mesma empresa** que continua valendo:

- **(a)** movimentação vinculada à pessoa, que **não é `estorno`** e **não tem estorno apontando para ela**
  (`not exists (… where e.estorno_de = m.id)`);
- **(b)** lançamento de item vinculado à pessoa, com `estorna_id` nulo e **sem inverso apontando para ele**;
- **(c)** o **detentor atual** de algum ativo é a pessoa (`ativos.colaborador_atual`, que é texto — não há coluna de id).

**"Vinculado"** = `colaborador_id = c.id`, OU, quando o `colaborador_id` é nulo, `colaborador_chave(texto) =
c.nome_chave` (o histórico anterior à F37 e o fato 13). O detentor casa sempre pela chave. **"Mesma empresa"** =
`empresa_id` do registro = `empresa_id` do cadastro (para o vínculo por id a FK composta já garante; para a chave e o
detentor é o join que garante).

**Registros estornados** = os registros vinculados que NÃO continuam valendo: a movimentação estornada, o lançamento
com inverso e o próprio inverso que guardou a pessoa. **Sem uso** = cadastro **ativo** sem uso efetivo. O selo diz o
porquê: `nunca usado` (zero registros vinculados) ou `N registros, todos estornados` (`1 registro, estornado` no
singular). Inativo nunca tem selo.

### 2.3 B3 no banco — `supabase/migrations/0180_colaboradores_uso_efetivo.sql` (classe ADITIVA) — **D4**

```sql
create function public.colaboradores_uso_efetivo()
returns table (colaborador_id uuid, registros_validos bigint, registros_estornados bigint,
               ativos_com_a_pessoa bigint, uso_efetivo boolean, sem_uso boolean)
language sql stable security invoker set search_path = public
```

- **Um comando só**, por conjunto (cada `colaborador_chave` calculada uma vez por linha do acervo, agregada por
  `(empresa_id, colaborador_id)` e `(empresa_id, chave)`, e juntada a `colaboradores` pelo par) — nada de subconsulta
  correlacionada por cadastro. Uma linha por cadastro, ativo ou não.
- `security invoker`: quem recorta é a RLS da F66 (o termo de empresa das policies); o `empresa_id` do join é
  **integridade de junção** — o registro da pessoa é o da empresa dela —, o mesmo motivo das duas `rel_*` da `0179`.
- `revoke all … from public, anon` + `grant execute … to authenticated` (o par da memória "revoke de PUBLIC").
- Rodapé com VERIFICAÇÃO PÓS-APPLY e `ROLLBACK` (`drop function …`).
- **As travas que ela encontra, e o que cada uma ganha** (nenhuma afrouxada):
  - `k_leitura_tenant` (`catalogo_policies.sql`, a fonte única): entrada nominal
    `colaboradores_uso_efetivo:colaboradores,movimentacoes,lancamentos_item,ativos`, com o motivo; a 15h a confere POR
    COMANDO (cada `x.empresa_id` com a origem provada) e a 15k exige que ela exista e leia a coluna;
  - as cópias dos nomes (`empresa_no_acervo.sql` `k_leitura_tenant_nomes`, a do `empresa_no_vocabulario.sql`, se
    houver) e a amarração do describe 14 de `catalogos-seguranca.test.ts`; a trava de mesa
    `empresa-acervo-sem-leitura.test.ts` lê a lista da fonte única;
  - `DA_F38` (`migrations-f38.test.ts`) recebe `'0180'`; `npm run db:lock` no MESMO commit; o classificador confere a
    classe; "toda função nova é security invoker" passa;
  - `src/lib/types/database.ts`: o bloco da função em `Functions` (hand-fix na forma exata do gerador — sem MCP não há
    geração; o gate `db:types:diff` do CI confere contra o banco do CI); a regeneração por MCP de produção fica no
    caminho B;
  - a forma da F58: `LEITURA_USO_COLABORADORES = leituraDeRpc({ …, matriz: { tipo: 'sem-argumentos' } })` em
    `formas/colaboradores.ts` + linha no `CATALOGO`;
  - o injetor: três mutações por `mutarFuncao` (o filtro do estorno, o par de empresa no join pela chave, o casamento
    pela chave), cada uma derrubando o seu rótulo; o teto do lote sobe de 151 para 154 com o motivo escrito (D7).

### 2.4 A9 — `supabase/tests/colaborador_uso_efetivo.sql`

Nasce **vermelho num push** (a função ainda não existe) e fica verde com a `0180`. Casos, cada um com a sua afirmação:

| Rótulo | Caso | Esperado |
|---|---|---|
| u1 | saída estornada | sem uso, `registros_estornados ≥ 1` |
| u2 | cadastro abandonado | sem uso, `registros_estornados = 0` (nunca usado) |
| u3 | estornada + outra válida | em uso |
| u4 | consolidado só com texto (movimentação antiga com o nome e `colaborador_id` nulo) | em uso |
| u5 | item lançado e estornado (inverso) | sem uso |
| u6 | detentor atual (ativo com `colaborador_atual` = o nome, sem movimentação vinculada) | em uso |
| u7 | inativo sem registro | `sem_uso = false` (fora do selo) |
| u8 | homônimo em OUTRA empresa com movimentação válida lá | não conta: o cadastro desta empresa segue sem uso |
| u9 | a chamada como `authenticated` (admin) devolve a mesma resposta que como dono | grant + RLS |

A outra empresa é plantada como `postgres`, com `empresa_id` por extenso (o molde de `isolamento_tenant.sql` e
`integridade_tenant.sql`). Rótulos LITERAIS (`✗ u1 …`), para o injetor enxergar.

### 2.5 A leitura e a tela (B4)

- `src/lib/queries/colaboradores.ts`: `listarColaboradoresAdmin` lê, em paralelo ao que já lê, `chamarRpc(supabase,
  'colaboradores_uso_efetivo', {})` por `paginarTodos` (OFFSET, `.order('colaborador_id')`, `CAP_COLABORADORES`), pela
  forma; junta por id em memória. `ColaboradorAdmin` ganha `uso: UsoDoColaborador | null` (`null` = a leitura do uso
  falhou: a lista continua, registra a falha e a tela avisa — a lista de pessoas não cai por um selo). Os números do
  selo vêm PRONTOS do banco; o cliente só filtra a lista completa (paginada até o fim, com teto que lança).
- `src/lib/colaboradores/uso.ts` (puro, importável pelo cliente): `porqueSemUso(registrosEstornados)` e
  `casaFiltroDeUso(c, filtro)`.
- `src/components/admin/colaboradores-tabela.tsx`: na célula "Status" da linha ATIVA sem uso, `Badge variant="outline"`
  "Sem uso" + o porquê em `text-xs text-muted-foreground`; o filtro **"Uso: Todos · Em uso · Sem uso"** em estado
  local, ao lado dos dois de hoje (`Em uso` = tem uso efetivo; `Sem uso` = o selo). "Registros" não muda. Inativo não
  ganha selo. Desativar segue pelo "Editar". **Nenhum estado muda sozinho.**
- Testes: `colaboradores-tabela.test.tsx` (grau 1: selo e porquê, inativo sem selo, "Registros" igual) e
  `colaboradores-tabela.dom.test.tsx` (o filtro, por interação), `uso.test.ts` (puro). Sem token novo de cor (o
  `outline` é `text-foreground` sobre o fundo), então `npm run contraste` só confirma que nada mudou.
- Prévia fotografada em `docs/v1.71.2-evidencias/` (claro/escuro, 1366/390, dado fictício).

### 2.6 B2 — a medição de hoje, só números

O SQL (texto no relatório) não tem canal (D1). A contagem "antes" sai por um instrumento só-leitura
(`docs/v1.71.2-evidencias/medir-uso.mts`, rodado com `npx tsx --env-file=.env.local`): a sessão de consulta do smoke
em produção, pela API de leitura do app, paginada até o fim; a chave pelo `chaveColaborador` (o espelho provado do
SQL); imprime SÓ contagens. A regra é a de §2.2, a mesma da função. O ensaio entra se houver credencial de leitura
sancionada para ele; senão, fica declarado. O "depois" (A8) depende do apply — caminho B. **D8.**

### 2.7 Documentos e versão

Spec (emenda: o cadastro nasce no clique; o estorno não toca o cadastro; o selo e o filtro); ajuda
`administracao.ts` (seção de colaboradores); ARQUITETURA §10 (o uso efetivo); MATRIZ (a nova exceção de leitura, na
emenda F66); ata; RUNBOOK (o caminho B); CHANGELOG + `1.71.2` + `registry.ts` — no PR B, que fica sem merge e sem tag
enquanto o apply não acontecer.

## 3. Fora (regra 1)

O texto copiado/e-mail, os KPI tiles, os outros cards, o "Disponíveis por modelo", o jsonb dos snapshots já gerados;
o momento do cadastro inline, as RPCs de estorno, a máquina de estados, as sugestões do campo, a fila de consolidação, o
significado de "Registros"; desativar/reativar/apagar qualquer colaborador; tudo do plano multiempresa (F66B, F67,
defaults, policies); `src/components/ui/**`, dependências, workflows, proteção da `main`, `linha-de-base.json`.

## 4. Verificação de ponta a ponta

1. Por incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`. Antes de cada PR: `npm run build`,
   `npm run verificar:actions`, `npm run contraste`, `node scripts/db/classificar-migration.mjs` (B).
2. CI (`verificar` + `banco-sem-docker`) verde em cada PR; o roteiro A9 vermelho num push antes da `0180`.
3. Revisão adversarial em contexto fresco (perguntas da ordem), cada achado com um cético.
4. A: merge → `/api/saude` = `1.71.1` → `node scripts/smoke/smoke-prod.mjs` (0 falha) → tag `v1.71.1`.
5. B: PR aberto, sem merge (D1); o caminho B no topo do relatório.
6. C: relatório final + evidências, PR só de docs.

## 5. Decisões (atas)

- **D1** Sem canal de banco → Frente B sem apply e sem merge; tudo o mais entregue e provado pelo CI.
- **D2** Fato 6 errado: nada a tirar de `PENDENTES`; o arquivo segue sob a régua.
- **D3** Fatos 10 e 14 corrigidos (0122; função, não view).
- **D4** B3 é FUNÇÃO `security invoker`, não view (N1, N2), com exceção nominal em `k_leitura_tenant` — a lista que a
  F66 já usa; nenhuma lista de exceção nova.
- **D5** A montagem dos reservados vira função pura testável; leitura idêntica.
- **D6** Total do card = tamanho da lista congelada; no v2 igual ao KPI por construção.
- **D7** Três mutações novas e o teto do injetor de 151 para 154.
- **D8** B2 medido pela leitura do app (sessão de consulta), só contagens, enquanto o SQL não tem canal.
- **D9** "Em uso" = tem uso efetivo (qualquer status); "Sem uso" = o selo (ativo sem uso). Inativo sem uso não cai em
  nenhum dos dois.
- **D10** A leitura do uso degrada para `null` (lista sem selo e com aviso), nunca derruba a lista de pessoas.
