# PLAN — F37 · Fundação: quem é a pessoa e o que é o item

Ordem: `docs/prompts/F37-fundacao-colaboradores-tipos-ultracode.md` (28/08/2026).
Fonte do escopo: `docs/PLAN-F36-F39.md` §4 (decisões D5, D6, D7).
Versão de saída: **1.42.0**. Migrations livres conferidas: a última é a `0111` → **`0112`, `0113`, `0114`**.

> Este arquivo substitui o PLAN.md da F29 (histórico no git). É o plano autossuficiente exigido
> pela seção "Como trabalhar" da ordem.

---

## 0. O ambiente, antes de tudo (o que muda o plano de rollout)

| Peça do runbook | Estado real em 28/08/2026 | Consequência |
|---|---|---|
| MCP Supabase | **não existe nesta sessão** | banco vai pela **Management API** (`POST /v1/projects/{ref}/database/query`) |
| Projeto de **ensaio** (`sgmvldiizsrjbxzzpmhh`) | **INACTIVE** (pausa do plano gratuito) | `restore` é **recusado pelo classificador**; ensaio indisponível |
| Docker / `psql` / Supabase CLI local | **ausentes** | `supabase start` não roda aqui |

**Ensaio possível:** `begin; <migration>; <conferências>; rollback;` contra **produção** — roda contra o dado
real e não deixa rastro (precedente F36, ata de 2026-08-28). A prova final continua sendo o job `banco`
do CI, que sobe um Postgres limpo e aplica `0001`→última.

**Consequência dura para a frente C:** o harness de medição **não pode rodar** — ele precisa de um banco
onde se possa escrever 500 mil linhas, e produção está proibida em qualquer hipótese (§C.2). O harness é
escrito, guardado e conferido; a **curva dos três patamares fica como pendência nº 1**, com o comando
exato para rodá-la assim que o ensaio voltar. O que **é** medido nesta fase: a âncora real, só-leitura,
no volume de hoje da produção (§C abaixo).

---

## 1. Baseline (medida ANTES de qualquer mudança)

```
npm run lint   → limpo (sem saída)
npm run test   → 128 arquivos, 2609 testes, todos passando (104,89 s)
npm run build  → limpo, 26 rotas
```

Contagens de produção (só-leitura, 28/08/2026):

| tabela | linhas |
|---|---|
| `ativos` | 1616 |
| `movimentacoes` | 3429 |
| `lancamentos_item` | 30 |
| `itens` | 18 |
| `pendencias_item` | 17 |
| `filiais` | 6 · `profiles` 15 |

Colaborador em texto: **1420** registros com nome preenchido (1412 em `movimentacoes` + 8 em
`lancamentos_item`), **956** grafias distintas, **904** chaves normalizadas distintas → a normalização
junta **52** grafias. `ativos.colaborador_atual` preenchido em 1241 ativos.

Slugs de acessório realmente gravados no histórico: `cabo`, `carregador`, `mochila` (em
`movimentacoes.itens_faltantes` **e** em `pendencias_item.item`) — os outros 4 dos 7 existem só no código.

---

## 2. A decisão de desenho que governa a frente A

A ordem (§A.3) proíbe UPDATE em histórico, e `guarda_acervo` (`0081`) recusa UPDATE em
`movimentacoes`/`lancamentos_item` **para todo mundo, service role incluso** (corpo lido do banco:
`raise exception 'Registro histórico não se altera: % é imutável…' using errcode = '42501'`).

**Como o híbrido grava os dois lados sem tocar em nada existente:**

- `colaborador_id` é resolvido **no servidor, no momento do INSERT**, a partir do texto que o operador
  deixou no campo — pela **chave normalizada**, não por um id carregado pela tela.
- Isso mantém **intactos** o `Config` do wizard, o rascunho do `sessionStorage`, o schema Zod, o resumo
  de revisão, o "repetir última", os kits e a contrapartida da troca — e por isso **os testes existentes
  desses fluxos passam sem uma linha editada** (critério 3 da ordem).
- Quem escolheu um cadastro na lista grava os dois (o texto bate com a chave → resolve).
  Quem digitou um nome que não está no cadastro salva do mesmo jeito, com `colaborador_id` nulo.
  Quem digitou "joão  silva" para um cadastro "João Silva" **também** resolve — a chave é a mesma.
- O passado continua sendo resolvido **por chave na leitura**. Nenhum UPDATE, em lugar nenhum.

**A chave mora no SQL, numa função IMMUTABLE nomeada** — `public.colaborador_chave(text)` — usada pela
coluna gerada **e** pela view da fila de consolidação. Uma âncora só para a guarda TS↔SQL.

Expressão (validada contra o banco real em transação desfeita):

```sql
lower(btrim(regexp_replace(translate($1,
  'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
  'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'),
  '[ \t\n\r\f\v]+', ' ', 'g')))
```

Duas diferenças deliberadas frente ao DDL rascunhado no §4.1 do plano (as duas viram ata):

1. **`btrim` DEPOIS do colapso**, não antes. Com `btrim` antes, `"\tJoão"` viraria `" joao"` — com um
   espaço à esquerda na chave. Colapsar e então aparar resolve.
2. **Classe explícita `[ \t\n\r\f\v]` no lugar de `\s`.** `\s` do Postgres é `[[:space:]]` (depende de
   locale) e o `\s` do JavaScript inclui NBSP e outros espaços Unicode — **eles não são o mesmo
   conjunto**. Com a classe explícita os dois lados são idênticos por construção, e é isso que torna a
   guarda TS↔SQL uma prova, não uma esperança. `ñ/Ñ` entrou na tabela de acentos.

Prova empírica já rodada (transação desfeita contra produção): `"  João   Silva  "` → `joao silva`;
`"JOAO SILVA"` colidiu no índice único com a anterior; `"Ção Ñandú Ünico"` → `cao nandu unico`;
`E'Maria\tdos\nSantos'` → `maria dos santos`.

---

## 3. As três migrations (DDL final)

### `0112_colaboradores.sql`
- `create function public.colaborador_chave(text) returns text language sql immutable strict set search_path = public` — a expressão acima.
- `create table public.colaboradores`: `id uuid pk default gen_random_uuid()`, `nome text not null`,
  `matricula text`, `setor text`, `filial_id smallint references filiais(id)`, `ativo boolean not null default true`,
  `criado_por uuid not null references profiles(id)`, `created_at timestamptz not null default now()`,
  `nome_chave text generated always as (public.colaborador_chave(nome)) stored`,
  `check (btrim(nome) <> '')`.
- `create unique index colaboradores_nome_chave_uidx on public.colaboradores (nome_chave)`.
- Índice auxiliar `colaboradores_filial_idx (filial_id) where filial_id is not null`.
- RLS **ligada** + 3 policies (padrão `itens`/`kits_modelos`, com o piso da `0070`):
  - `leitura operador` — `for select to authenticated using ((select public.papel_atual()) is not null)`
  - `escrita cria colaborador` — `for insert to authenticated with check ((select public.pode_escrever()))`
  - `admin atualiza colaborador` — `for update to authenticated using ((select public.e_admin())) with check ((select public.e_admin()))`
  - **sem policy de DELETE** → ninguém apaga cadastro pela API (deny-all, mesmo idioma de `operador_filiais`/`eventos_admin`).
- `grant select, insert, update on table public.colaboradores to authenticated;` — **explícito**, seguindo o
  precedente da `0103` (o Postgres do job `banco` não reproduz o *default privilege* da plataforma).
- `create view public.v_colaboradores_textos with (security_invoker = true)` — a fila de consolidação,
  **agregada no SQL** (lição do teto de 1.000): agrupa por `colaborador_chave`, devolve
  `nome_chave · grafia_exemplo (mode) · ocorrencias · grafias · filial_id (mode) · ja_cadastrado · colaborador_id`.
  `grant select on public.v_colaboradores_textos to authenticated;`

### `0113_colaborador_vinculo.sql`
- `alter table public.movimentacoes add column colaborador_id uuid references public.colaboradores (id);`
- `alter table public.lancamentos_item add column colaborador_id uuid references public.colaboradores (id);`
- Índices `(colaborador_id) where colaborador_id is not null` nas duas.
- **Nada mais.** Nenhuma função, nenhum trigger, nenhuma policy existente. Os INSERTs de todas as RPCs
  usam lista de colunas explícita — conferido uma a uma (`criar_compra_lote`, `devolver_ao_fornecedor`,
  `transferir_item`, `importar_ativos_substituir`, `forcar_estado_ativo`, `forcar_saldo_item`): nenhuma
  precisa mudar, a coluna nova nasce nula.

### `0114_tipos_item.sql`
- `create table public.tipos_item (id smallint generated always as identity primary key, slug text not null unique, rotulo text not null, ativo boolean not null default true, ordem int not null default 0, created_at timestamptz not null default now())`.
- Seed **exato**, na ordem de `ACESSORIOS_DEVOLUCAO`: `carregador`/Carregador, `mochila`/Mochila,
  `mouse`/Mouse, `teclado`/Teclado, `mousepad`/Mousepad, **`fone`/"Fone de ouvido"**, `cabo`/Cabo.
- `alter table public.itens add column tipo_id smallint references public.tipos_item (id);`
- RLS + policies padrão de catálogo (`select` pelo piso; `insert`/`update` por `e_admin()`; sem delete).
- `grant select, insert, update on table public.tipos_item to authenticated;`

**Fora, byte a byte:** `aplicar_movimentacao`, `rel_estoque_asof`, `rel_saldo_itens`, `rel_mov_itens`,
`valida_lancamento_item`, `guarda_acervo`, `status_apos_movimentacao`, `status_tem_detentor`,
`resetar_dados_ficticios`. Nenhuma delas é recriada. Prova: `git diff` vazio nas migrations antigas +
`pg_get_functiondef` antes/depois.

---

## 4. Código

| Arquivo | O quê |
|---|---|
| `src/lib/colaboradores/chave.ts` | `chaveColaborador(nome)` — espelho EXATO da função SQL |
| `src/lib/colaboradores/chave-sql.test.ts` | guarda TS↔SQL: extrai a tabela de `translate` e a classe de espaço da migration vigente e compara com o TS, char a char; corpus de casos |
| `src/lib/validators/colaborador.ts` | `colaboradorSchema`, `colaboradorInlineSchema` (molde `itemInlineSchema`), `atualizarColaboradorSchema`, `consolidarColaboradoresSchema` |
| `src/lib/queries/colaboradores.ts` | `listarColaboradoresAdmin`, `listarColaboradoresAtivos`, `filaDeConsolidacao` (lê a view), `resumoDaConsolidacao` |
| `src/lib/actions/colaboradores.ts` | `criarColaboradorInline` (`exigirEscrita`… ver §5), `criarColaborador`/`atualizarColaborador` (`exigirAdmin`), `consolidarColaboradores` (`exigirAdmin`) |
| `src/lib/actions/movimentacoes.ts` | resolve as chaves do lote em UMA consulta e passa `colaborador_id` para `montarRow` |
| `src/lib/actions/itens.ts` | idem em `lancarItens` |
| `src/components/movimentacoes/nova/campo-colaborador.tsx` | combobox sobre `colaboradores` + criação inline, **mantendo texto livre** |
| `src/components/itens/lancar-item-dialog.tsx` | troca o `<Input>` cru pelo mesmo combobox |
| `src/app/(app)/admin/colaboradores/page.tsx` + `src/components/admin/colaboradores-*.tsx` | lista + fila de consolidação |
| `src/app/(app)/admin/tipos-item/page.tsx` + `src/components/admin/tipos-item-*.tsx` | cadastro de tipos |
| `src/components/admin/itens-tabela.tsx` / `item-dialog.tsx` | coluna e escolha de tipo, com selo "sem tipo" |
| `src/lib/dominio.ts` | `ACESSORIO_ROTULO.fone` → `'Fone de ouvido'` (só o rótulo) |
| `src/lib/validators/tipos-item-sql.test.ts` | guarda TS↔SQL dos 7 slugs + rótulos contra o seed da `0114` |

**Regra de ouro do incremento:** nenhum arquivo `*.test.*` existente é editado. Se um quebrar, quem está
errado é o código novo.

---

## 5. Permissão, nome a nome

| Ação | Guarda de Server Action | Policy |
|---|---|---|
| ler colaboradores / tipos | — (piso de leitura) | `papel_atual() is not null` |
| criar colaborador inline (wizard) | `exigirPapel(supabase, 'operador')` | `pode_escrever()` |
| editar/desativar colaborador | `exigirAdmin` | `e_admin()` |
| consolidar em lote | `exigirAdmin` | `e_admin()` (insert cabe em `pode_escrever`) |
| criar/editar tipo de item | `exigirAdmin` | `e_admin()` |

Por que `exigirPapel(…, 'operador')` e não `exigirEscrita`: `exigirEscrita(supabase, filialId)` cobra
**vínculo de filial**, e cadastro de pessoa não é matéria de filial (o `filial_id` é atributo, não escopo
de escrita). `exigirPapel` com o piso `operador` é o espelho exato de `pode_escrever()` — dev ⊃ admin ⊃
operador, e `consulta` recusado.

---

## 6. Provas

- **Roteiro novo** `supabase/tests/f37_colaboradores_tipos.sql`, no molde do `f36_detentor.sql`
  (independente, `begin; … rollback;`, `raise notice '✓'` / `raise warning '✗'`), cobrindo:
  a) a chave normaliza (corpus); b) o índice único recusa a segunda grafia; c) a view agrupa e conta
  certo; d) **asserção NEGATIVA**: `update movimentacoes set colaborador_id = …` é recusado pela
  `guarda_acervo` **rodando como DONO** (molde `dev_destrutivo.sql:565-577`, checando a mensagem
  `%imutável%` — como `authenticated` quem barra é a RLS, e isso mediria a coisa errada);
  e) INSERT com `colaborador_id` funciona (o vínculo do registro novo); f) os 7 slugs; g) `itens.tipo_id`
  anulável; h) FK recusa tipo inexistente.
- **`papeis_rls.sql`**: asserções novas + as duas relações **dentro do bloco de grants** (armadilha
  `42501`) — `colaboradores` e `tipos_item` no bloco de leitura; `colaboradores` e `tipos_item` no de
  escrita, com o comentário dizendo qual asserção usa cada uma.
- **`seguranca_catalogo.sql`**: nenhuma edição — os blocos 2 (RLS ligada) e 3 (`security_invoker`) são
  varreduras genéricas e já cobrem tabela/view nova. Se eu esquecer o `enable row level security` ou o
  `security_invoker` da view, é ele que acusa.
- **Todos** os roteiros rodados (regra F17), pelo caminho da Management API com
  `raise warning` → `raise exception` (o transporte engole NOTICE/WARNING). Ficam de fora, como na F36:
  `dev_destrutivo.sql` e `import_substituir.sql` (travariam produção); `conflito_filiais.sql` e
  `troca.sql` falham por artefato de ambiente, idêntico antes e depois.

---

## 7. Frente C — a medição

`scripts/perf/medir-itens.mjs`, no molde do `medir.mjs` (mesmo cabeçalho de regras, mesma máscara de
segredo, mesmo JSON versionado em `docs/perf/`), com:

- guarda `REFS_DE_PRODUCAO` reutilizada de `scripts/env-guard.ts` — **recusa produção sempre**, e
  também recusa quando o ref não é conhecido como ensaio;
- três patamares (10 mil / 100 mil / 500 mil) de lançamentos **100% fictícios** (`@faker-js/faker`, seed
  determinístico), `EXPLAIN ANALYZE` em `rel_saldo_itens`, `rel_mov_itens`, o custo por INSERT do trigger
  `valida_lancamento_item` e o histórico paginado;
- limpeza obrigatória com contagem antes/depois.

**O que É medido nesta fase** (só-leitura, produção, permitido e já rodado):

| medida | volume de hoje | resultado |
|---|---|---|
| `rel_saldo_itens(null, hoje)` — conexão fria | 30 lançamentos | **17,8 ms**, 1138 blocos |
| `rel_saldo_itens(null, hoje)` — conexão quente | 30 lançamentos | **1,1 ms**, 3 blocos |
| `rel_mov_itens(null, -30d, hoje)` — fria | 30 lançamentos | **7,1 ms**, 1088 blocos |
| histórico paginado (20 linhas) | 30 lançamentos | **0,34 ms**, 8 blocos |

Leitura: no volume de hoje **a agregação não custa nada** — o custo medido é compilação de plano e
catálogo da conexão nova. O driver real de escala está identificado por leitura do corpo:
`valida_lancamento_item` agrega **todo o diário de (item, filial) a cada INSERT** sob
`pg_advisory_xact_lock` → popular N linhas do mesmo par custa **O(N²)**; `rel_saldo_itens` varre o diário
inteiro até a data → **O(N)** por leitura.

---

## 8. Rollout (§R)

1. `0112` → `0113` → `0114` por Management API: **ensaio em transação desfeita contra produção** →
   roteiros SQL → conferência → **produção** → `notify pgrst, 'reload schema';` → conferência pós-apply.
2. `npm run db:types` (via `--project-id`, Management API) e commit do `database.ts`.
3. SQL **antes** do deploy da Vercel.
4. CI verde (lint + test + build + job `banco`), deploy READY, smoke com as duas rotas novas.
5. Tag anotada `v1.42.0` publicada.
6. `docs/RELATORIO-F37.md` + emendas (`CLAUDE.md` árvore, spec §5/§6, `README.md`,
   `docs/prompts/README.md` linha F36 → relatório e linha F37, `docs/PLAN-F36-F39.md` §4 executado e
   §4.1 corrigido, `docs/DECISOES.md` com uma ata por decisão).

## 9. Ordem dos incrementos

1. `0112`+`0113` + RLS/grants + `db:types` → 2. chave TS + guarda → 3. resolução no INSERT (as duas
actions) → 4. combobox + criação inline (wizard e item) → 5. `/admin/colaboradores` + fila →
6. `0114` + seed + guarda TS↔SQL + rótulo do `fone` → 7. `/admin/tipos-item` + coluna em `admin/itens` →
8. roteiro SQL + `papeis_rls.sql` → 9. `seed.ts`/`reset.ts` → 10. ajuda/nav/paleta/smoke/título →
11. harness + medição → 12. versão + documentação → 13. revisão adversarial em contexto fresco.

Frentes A e B correm em paralelo até `admin-nav`/ajuda/smoke, que são ponto de encontro.
