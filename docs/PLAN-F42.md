# PLAN-F42 — as telas de itens entram no casco

**Escrito em 31/08/2026**, antes de qualquer linha de código, a partir da ordem
`docs/prompts/F42-telas-itens-ultracode.md`, do `docs/PLANO-ITENS.md` §6 e do handoff da F41
(`docs/RELATORIO-F41.md` §10). É o gabarito da revisão adversarial — sobrevive à compactação.

**Objetivo declarado, que é o critério de tudo:** quem sabe usar `/ativos` sabe usar `/itens` sem
aprender nada novo.

**Sem migration.** A F41 entregou o banco. `git diff v1.46.0..HEAD -- supabase/` tem de sair vazio.

---

## 0. A linha de base, medida antes de mexer

| Comando | Estado em 31/08/2026, na `main`, antes da fase |
|---|---|
| `npm run lint` | ✅ limpo |
| `npm run test` | ✅ 144 arquivos · 3.291 testes |
| `npm run contraste` | ✅ (com o `❌` esperado do "antes" registrado da F40) |
| `npm run build` | ✅ 33 rotas |

**A régua, com `'src/app/(app)/itens/'` e `'src/components/itens/'` fora de `PENDENTES`:**

- **30 testes vermelhos** de 458 em `src/lib/layout/consistencia.test.ts`
- **88 linhas de violação únicas** (o `linha N: …` de cada culpado)
- Distribuídas por 8 regras: título à mão (2), largura fora do casco (1), escala de espaçamento (5),
  moldura à mão (8), tipografia/largura arbitrária (6), rota no casco (5), esqueleto casa (2),
  inventário de rotas migradas (1)
- Superfície: **4.312 linhas** — `src/app/(app)/itens/page.tsx` (562) + `src/components/itens/**`
  (3.750, incl. `lancar-item-dialog.tsx` 893, `transferir-item-dialog.tsx` 457, `conferencia/` 598)

**A conferência de "Em uso" contra o banco** (`SELECT` agregado, só contagens):

| Banco | `Σ (total + falta − estoque − atrelados)` | `Σ greatest(0, Σsaida − Σretorno)` | Itens divergentes | Negativos |
|---|---|---|---|---|
| **produção** (`pbtjcalbmepmrqzprusb`), consolidado | **20** | **20** | 0 de 22 | 0 |
| **produção**, somado filial a filial | **20** | **20** | 0 pares | 0 |
| **ensaio** (`sgmvldiizsrjbxzzpmhh`) | **10** | **10** | 0 | 0 |

Produção hoje: `total 264 · em estoque 244 · em uso 20 · reservado 0 · falta 0` (264 = 244 + 20).

---

## 1. A fórmula de "Em uso" — por que ela não precisa de migration

`rel_saldo_itens` (vigente: `0027_itens_total_estoque.sql`, nunca recriada depois) calcula
internamente `liberados = greatest(0, Σsaida − Σretorno)` — que é exatamente "Em uso" — mas **não o
devolve**. Devolve `total`, `estoque`, `atrelados`, `falta`, onde:

```
estoque = greatest(0, total − atrelados − liberados)
falta   = greatest(0, atrelados + liberados − total)
```

Como `max(0, x) − max(0, −x) ≡ x` para todo `x`, com `x = total − atrelados − liberados`:

- **Ramo com estoque** (`atrelados + liberados ≤ total`): `falta = 0`, `estoque = total − atrelados − liberados`
  → `total + 0 − (total − atrelados − liberados) − atrelados = liberados` ✔
- **Ramo com falta** (`atrelados + liberados > total`): `estoque = 0`, `falta = atrelados + liberados − total`
  → `total + (atrelados + liberados − total) − 0 − atrelados = liberados` ✔

**`em_uso = total + falta − estoque − atrelados` é uma identidade algébrica, exata nos dois ramos.**
Não há caso de borda. E é **aditiva por filial** pelo mesmo motivo que `somarSaldosDeFiliais` já
soma célula a célula: cada clamp da RPC é aplicado *dentro* de uma filial.

Implementação: `emUsoDoSaldo()` em `src/lib/itens/lista.ts`, **função pura**, com teste caso a caso
nos dois ramos e no zero, **e** a conferência contra o `SELECT` acima colada no relatório.
**Sem clamp em `Math.max(0, …)`**: a derivação já devolve o valor clampado; um clamp extra
esconderia divergência em vez de expor.

---

## 2. Arquivos e interfaces — o mapa da fase

### Etapa A — `/itens` no casco

| Arquivo | Ação | O que fica lá |
|---|---|---|
| `src/lib/itens/lista.ts` | **novo** | `emUsoDoSaldo(s)`, `saldoDoRecorte(linha, filialIds)`, `saldoDoParPorItem(saldos)`, `filtrarSaldos(linhas, {q, grupo})`, `paginarLinhas(linhas, page, pageSize)`, `rotuloSubtituloItens(...)`, `destinoHistoricoLegado(sp)` |
| `src/lib/itens/lista.test.ts` | **novo** | os dois ramos de `emUsoDoSaldo`, o zero, a aditividade, a paginação (clamp de página, fatia, total), o filtro, o redirecionador legado |
| `src/app/(app)/itens/page.tsx` | **reescrita** | `Pagina` (largura `cheia`) + `CabecalhoDaPagina` + `QuadroDeTabela` + `EstadoVazio`; UMA leitura de saldos (`getSaldosPorFilial`), UM filtro, UMA paginação (dos itens) |
| `src/app/(app)/itens/loading.tsx` | **reescrita** | monta um `<Pagina>` de verdade, mesma variante (regra 8 da régua) |
| `src/components/itens/itens-filtros.tsx` | **reescrita** | busca + filial + grupo + Limpar, na gramática de `AtivosFiltros`. **O toggle Consolidado/Por filial morre.** |
| `src/components/itens/itens-table.tsx` | **novo** | a tabela única, client (linha expansível), com o chevron `BotaoExpandir` da F16 |
| `src/components/itens/saldos-filiais.tsx` | **apagado** | vira a linha expansível de `itens-table.tsx` |
| `src/lib/actions/exportar.ts` | edição | `filiaisDeItens` para de gatear em `?visao=`; `exportarItensSaldosCSV` deixa de ramificar e passa a emitir **um formato só, superset dos dois** |
| `src/lib/url-params.ts` | edição | `ehVisaoConsolidado` sai (nenhum chamador sobra) |

**A tabela única.** Colunas, na ordem:

`⌄ · Item (+ selo repor) · Grupo · Tipo · Total · Em estoque · Em uso · Falta · ⋯`

- `Grupo` = `GRUPO_ITEM_META[grupo].titulo` — era o **cabeçalho de seção**; sem coluna, sumiria.
  Escondida abaixo de `md`.
- `Tipo` = `tipos_item.rotulo` (F37), `—` quando o item não tem tipo. Escondida abaixo de `lg`.
- `Em uso` = a coluna nova, por `emUsoDoSaldo`. Explicação no `Dica`, vinda de `NUMEROS_ITEM`.
- `Falta` continua com o selo vermelho "faltam N"; `repor` continua junto do nome. **São dois avisos
  diferentes e continuam como estão.**
- `⌄` abre a **linha expansível**: uma filial por linha, com `Em estoque · Em uso · Total · faltam N`
  e o atalho de transferência da célula, mais o "inclui N de filial desativada".

**Uma leitura só.** `getSaldosPorFilial(filiais)` devolve `porFilial` + `consolidado` para cada item.
Os números da tabela saem de `saldoDoRecorte(linha, filialIds)`: sem recorte usa `consolidado` (que é
o global verdadeiro, incluindo filial desativada); com recorte soma as filiais marcadas. **Uma fonte,
zero deriva** entre tabela, linha expansível e CSV.

**A paginação pagina os itens.** `AtivosPaginacao` com `saltoPagina` e `tamanhos={TAMANHOS_PAGINA}`
(25/50/100, reusando `@/lib/ativos/lista` — fonte única, doutrina F12/W6A). Params `page` e `pp`.
A fatia é em memória, sobre a lista já filtrada (o catálogo é curto — é o que a tela já assume).

### Etapa B — `/itens/historico`

| Arquivo | Ação |
|---|---|
| `src/app/(app)/itens/historico/page.tsx` | **novo** — `Pagina` cheia, `CabecalhoDaPagina` "Histórico de lançamentos", ação "Exportar histórico", `LinkAjuda` |
| `src/app/(app)/itens/historico/loading.tsx` | **novo** — `<Pagina>` com a mesma variante |
| `src/app/(app)/itens/historico/error.tsx` | **novo** — molde de `itens/error.tsx` |
| `src/components/itens/historico-filtros.tsx` | edição — **ganha o filtro de filial** (`FiltroFilial`), que antes vinha do bloco de saldos e se perderia na separação |
| `src/components/itens/historico-lancamentos.tsx` | edição — só conformidade com a régua |

**Chega-se por:** botão "Histórico" no cabeçalho de `/itens`; e pela linha do item, no menu `⋯` →
"Ver histórico deste item" (já com `?item=<id>`).

**Link antigo não quebra.** `/itens?item=…&tipo=…&de=…&ate=…&busca=…` → `redirect` para
`/itens/historico` preservando o recorte (`item`, `tipo`, `de`, `ate`, `busca`, `filial`, `page`).
Função pura `destinoHistoricoLegado`, testada. `/itens?visao=…` **não** precisa de redirect: o param
vira ruído ignorado e a tela renderiza normalmente (nada de 404, nada de tela quebrada).

### Etapa C — os diálogos

| Arquivo | Ação |
|---|---|
| `src/components/itens/carrinho-linhas.tsx` | **novo** — as linhas do carrinho (combobox + quantidade + remover + prévia), com slot opcional para o alternador de sinal do Ajuste |
| `src/components/itens/escolha-tipo-lancamento.tsx` | **novo** — os 4 botões + pílula + erro |
| `src/components/itens/lancar-item-dialog.tsx` | encolhe — usa os dois acima, **apaga o bloco morto `grupoDuplo`** (a F41 zerou a segunda pergunta e o JSX ficou), ganha a **prévia da regularização** |
| `src/components/itens/transferir-item-dialog.tsx` | encolhe — reusa `carrinho-linhas.tsx` |
| `src/lib/actions/itens.ts` | `buscarSaldosItens` passa a devolver `Record<number, SaldoDoPar>` (`{emEstoque, emUso}`) em vez de só o estoque |

**A prévia da regularização**, por linha do carrinho, com a **mesma função pura da F41**
(`partirQuantidade` de `src/lib/itens/regularizacao.ts`) e o **mesmo texto**
(`avisoDeRegularizacao`). O `SaldoDoPar` que ela pede é exatamente `{emEstoque, emUso}` — e `emUso`
agora existe, derivado. Nenhuma segunda conta.
Colateral honesto e barato: o `res.avisoRegularizacao` que a action **já devolve** e que o toast
descartava passa a ser dito.

**`transferir-item-dialog` NÃO migra para `react-hook-form`.** Não há teste de componente neste
repositório; a própria `DIVIDA-TECNICA.md` registra o argumento. Encolher com segurança (reuso do
carrinho) vale mais que reescrever o mecanismo de estado às cegas. **Ata em `DECISOES.md`** + o item
K da dívida atualizado com o critério e o que ficou.

### Etapa D — as outras superfícies

| Arquivo | Ação |
|---|---|
| `src/lib/queries/itens.ts` | `ItemQueFoiJunto` ganha `regularizacao`; o `.select()` pede a coluna. `listarItensAtivos` passa a trazer `tipo_id` + `tipos_item(rotulo)` |
| `src/components/ativos/itens-que-foram-junto.tsx` | selo **"regularizado"** |
| `src/app/(app)/itens/conferencia/page.tsx` + `loading.tsx` | entram no casco — **sem tocar na aritmética** (`conferencia/rascunho.ts` e o teste dele ficam intactos) |
| `src/components/itens/conferencia/*.tsx` | só conformidade com a régua |
| `src/components/layout/sidebar-nav.tsx` | "Itens" ganha as subrotas Conferir · Histórico |
| `src/components/layout/paleta-comandos.tsx` | entrada "Histórico de itens" |
| `src/lib/ajuda/conteudo/mapa-das-telas.ts` | a linha "Itens" deixa de dizer "e o histórico"; entra a linha do histórico |
| `src/lib/ajuda/conteudo/itens-por-quantidade.ts` | `NUMEROS_ITEM` ganha **"Em uso"**; a prosa acompanha |
| `src/lib/ajuda/conteudo/saldos-e-estoque-minimo.ts` | a seção `visoes` deixa de descrever o toggle e passa a descrever a linha expansível; `saldos-exportar` descreve o arquivo único |
| `src/lib/ajuda/conteudo/lancar-itens.ts` | a seção `historico` passa a citar a rota própria |
| `src/lib/ajuda/registry.test.ts` | `COBERTURA` ganha `/itens/historico` |
| os 4 testes de conteúdo (`comecar`/`operacao`/`gestao`/`referencia`) | atualizados **no mesmo commit** da prosa que mudou |
| `scripts/smoke/smoke-prod.mjs` | as 3 entradas de `?visao=` reescritas; `/itens/historico` nas DUAS listas |
| `scripts/design/capturar.mjs` | `ROTAS_PADRAO` ganha `/itens`, `/itens/historico`, `/itens/conferencia` — **sem rodar o script** (não há `.env.ensaio`; apontar para `.env.local` fotografaria produção) |
| `src/lib/layout/consistencia.test.ts` | os 2 prefixos saem de `PENDENTES`; as 3 travas do piloto **atualizadas** |
| `package.json` · `CHANGELOG.md` · `src/lib/versoes/registry.ts` | **versão 1.47.0** + tag anotada |
| `docs/*` | ESPECIFICACAO, ARQUITETURA §10, PLANO-DESIGN-SYSTEM, DIVIDA-TECNICA, DECISOES, README, PLANO-ITENS §6 |

**As 3 travas do piloto, atualizadas para a verdade nova:**

1. `expect(ROTAS.length).toBe(29)` → **30** (`/itens/historico` é rota nova do grupo)
2. `ROTAS_MIGRADAS` de `['/ativos','/ativos/[id]','/ativos/novo']` → **+ `/itens`, `/itens/conferencia`, `/itens/historico`** (6)
3. "toda linha de `PENDENTES` aponta para arquivo que existe" — continua verde porque os dois
   prefixos saem **inteiros**, não pela metade

`PENDENTES` **só encolhe**. `/admin`, `/relatorios`, `/movimentacoes`, `/pendencias`, a home, `/dev`,
`/ajuda`, `/versoes` e a casca do app continuam pendentes, por decisão da F40.

---

## 3. A tabela recurso-a-recurso — o gabarito do critério 4

**Nenhuma linha desta tabela pode acabar em "sumiu".**

### Filtros

| Antes (em `/itens`) | Depois |
|---|---|
| Busca `q` ("Buscar item…") | `/itens` — igual |
| Filtro de filial (`FiltroFilial`, só na visão Consolidado) | `/itens` — **sempre visível** (a visão morreu) · e `/itens/historico` ganha o seu |
| Select "Grupo" | `/itens` — igual |
| Toggle "Consolidado / Por filial" (`?visao=`) | **vira a linha expansível** (chevron por item). O param deixa de ser modo; URL antiga não quebra |
| "Limpar" (bloco de saldos) | `/itens` — igual |
| Histórico: Busca (`busca`, "Chamado ou colaborador") | `/itens/historico` |
| Histórico: Select "Item" | `/itens/historico` |
| Histórico: Select "Tipo" | `/itens/historico` |
| Histórico: "De" / "Até" | `/itens/historico` |
| Histórico: "Limpar" | `/itens/historico` |
| Histórico: recorte de filial (herdado do bloco de saldos) | `/itens/historico` — **filtro próprio** (senão se perderia) |

### Colunas — saldos

| Antes | Depois |
|---|---|
| Seção por grupo (`GRUPO_ITEM_META[g].titulo` como `<h2>`) | coluna **Grupo** |
| Item | Item |
| Total | Total |
| Estoque | **Em estoque** |
| Atrelados/Reservado | **Falta** e `Reservado`: `Reservado` sai da tabela (é 0 em produção desde a F41) e continua no `Dica`/linha expansível e no CSV |
| Falta (selo "faltam N") | Falta (selo idêntico) |
| selo "repor" junto do nome | idem |
| *(não existia)* | **Em uso** |
| *(não existia)* | **Tipo** (F37) |
| visão por filial: uma coluna por filial + Total | **linha expansível**: uma filial por linha |
| "inclui N de filial desativada" | na linha expansível |

### Colunas — histórico

Data · Item · Tipo · Qtd. · Filial · Chamado · Colaborador · Obs. · Saldo após · Ações
→ **todas em `/itens/historico`, sem exceção**, inclusive a coluna condicional "Saldo após"
(1 item + 1 filial) e o diálogo de estorno.

### Ações

| Antes | Depois |
|---|---|
| `RealtimeRefresh` | `/itens` |
| "Exportar saldos" (CSV) | `/itens` — **um formato só, superset dos dois de antes** |
| "Conferir estoque" | `/itens` |
| "Transferir item" (diálogo) | `/itens` |
| "Lançar" (diálogo) + `?lancar=1` + atalho `L` | `/itens` |
| "+" de lançar por linha (`LancarItemLinha`) | `/itens` — na coluna `⋯` |
| atalho transferir por célula (`TransferirItemCelula`) | `/itens` — na linha expansível |
| "Exportar histórico" (CSV) | `/itens/historico` |
| "Estornar lançamento" | `/itens/historico` |
| paginação (do histórico) | `/itens/historico` — **e `/itens` ganha a sua, dos itens** |
| `LinkAjuda` | as duas rotas |
| estado vazio → `/admin/itens` (admin) | `/itens` |
| estado vazio → "Ver todas as filiais" | `/itens` |
| *(não existia)* | `⋯` → "Ver histórico deste item" |

### CSV de saldos — o formato único

`Item · Grupo · Tipo · Filial · Total · Em estoque · Em uso · Reservado · Falta ·
<cada filial> · <cada filial> — faltam · Fora das colunas`

Superset de `colunasSaldos` **e** `colunasSaldosPorFilial`, mais `Tipo` e `Em uso`. Um nome
(`itens-saldos`), uma forma — a divergência tela × arquivo (achado F12-W4-03) deixa de ter como
acontecer, porque não há mais duas visões.

---

## 4. Fora de escopo, declarado

- **Migration.** Nenhuma. `git diff v1.46.0..HEAD -- supabase/` vazio é o padrão esperado.
- `valida_lancamento_item`, as RPCs da F41, o enum `tipo_lancamento`, os nomes das colunas SQL.
- `/ativos`, o wizard de movimentação (salvo o cartão "Itens que foram junto").
- **As outras frentes da F40** — `PENDENTES` perde as linhas de itens **e mais nada**.
- `src/components/ativos/nova-compra-form.tsx`, `src/components/ui/`, `src/lib/types/database.ts`.
- Dependência nova (regra 3). `react-hook-form` **existe** e podia ser usado — não será, por decisão
  registrada (Etapa C).
- `npm run db:types` / `db:seed` / `db:reset` / `carga` — nenhum roda nesta ordem.
- Captura de tela (`capturar.mjs`) — a constante ganha as rotas, o script não roda.

---

## 5. Ordem de execução, com portão em cada etapa

`npm run lint` + `npm run test` + `npm run contraste` + `npm run build` **verdes antes de seguir**.

1. **A** — `/itens` no casco (lista, filtros, paginação, coluna nova, linha expansível, export)
2. **B** — `/itens/historico` + a saída dos links antigos
3. **C** — os diálogos (corte + prévia)
4. **D** — outras superfícies, texto, documentação, versão

Sem worktrees paralelas: as quatro frentes tocam os mesmos arquivos.

## 6. Verificação de ponta a ponta, no fim

1. Os quatro comandos verdes.
2. `npx vitest run src/lib/layout/consistencia.test.ts` — **0 violações** com os prefixos fora.
3. `grep -rn "Liberação\|Atrelar\|Retorno\|Atrelados" src/` — cada remanescente justificado.
4. `git diff v1.46.0..HEAD -- supabase/` vazio.
5. Dois revisores adversariais em contexto fresco (um contra este plano e os 11 critérios; outro só
   contra "o que o usuário pode ter perdido", com esta §3 como entrada).
6. Push → **os DOIS jobs do CI** (`verificar` e `banco`) verdes.
7. Merge na `main` + tag `v1.47.0` → deploy.
8. `node scripts/smoke/smoke-prod.mjs` + as checagens de `/dev` (a `reserva_aberta` da F41 em zero).
