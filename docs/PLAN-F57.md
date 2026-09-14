# PLAN-F57 — Os quatro significados de filial, e o fim do fail-open

Plano de execução da ordem `docs/prompts/F57-quatro-significados-de-filial-ultracode.md`, escrito **antes** de
qualquer código (14/09/2026, branch `f57-quatro-significados-de-filial`). Fonte da verdade do escopo: a ficha F57 do
`docs/PLANO-MULTIEMPRESA.md` §5, estendida pelas quatro decisões do Johnny e corrigida pelas medições abaixo.

---

## 1. Estado de partida — medido, não copiado

| Medida | A ordem / a ficha dizia | Medido hoje | Nota |
|---|---|---|---|
| Versão / última migration | `1.61.0` / `0140` | `1.61.0` / `0140` | confere; a fase é `1.62.0`, sem migration |
| `.from()` nas 5 tabelas em `lib/queries`+`lib/actions` (sem teste) | ~109 (ficha) · 116 (ordem) | **116 em 20 arquivos** | confere com a ordem |
| …e fora desse recorte, em `src/**` | — | **+1**: `src/app/(app)/ativos/[id]/page.tsx:76` | o inventário cobre `src/**` inteiro: **117** |
| `filtros/filial.ts` | "97 linhas, três funções" | **84 linhas**, três funções (`resolverFiliaisIds`, `resolverFiliaisSlugs`, `resolverFiliaisSlugsSemPadrao`) | divergência pequena |
| `podeEscreverNaFilial` | `auth/papeis.ts` (ficha) | `src/components/layout/permissoes.ts:41` | confere com a ordem (fato 6) |
| Tipos com o campo `filiaisEscrita` | dois (ordem) | **três**: `Operador` (`auth/acesso.ts:27`), `Permissoes` (`permissoes.ts:27`) e `OperadorDoFiltro` (`filtros/filial.ts:27`) | o terceiro é o recorte estrutural do filtro |
| Referências dos nomes (`grep -rnw src`) | fato 3 | `resolverFiliaisIds` 26 · `resolverFiliaisSlugs` 16 · `…SemPadrao` 7 · `filtroFilialPadrao` 20 · `filiaisDeEscrita` 27 · `filiaisEscrita` 85 (96 por substring, com `filiaisEscritaSchema`) · `escreveNaFilial` 28 · `abaRelatorioPadrao` 14 · `exigirEscritaEm` 19 · `podeEscreverNaFilial` 13 | o fato 3 contava sem os testes |
| Rotas que leem `filial` da URL | 8 | **8** (varredura de `src/app/**`) | a de `/relatorios/[filial]` **já** faz `notFound()` para slug inexistente |
| Funções exportadas com a convenção `[] = todas` | — | **18** em 8 arquivos (+ os três resolvedores) | lista no §6 |
| O "⚠ que a tela já mostra" ao operador sem vínculo | existe (ficha, risco) | **só do lado da ESCRITA** (`AvisoSemFilialDeEscrita`, 3 usos). Nas telas de LEITURA a queda em "todas" é silenciosa | o caso-limite 3 é provado como é, não como a ficha o descreve |
| Testes | — | **192 arquivos / 5014 testes**, `tsc` limpo | linha de base |

### 1.1 A divergência que muda uma decisão do Johnny — a identidade do ativo

A decisão i ("`compras.ts` é consertado de verdade — recorta por filial") parte de dois fatos da ordem: que a
régua **certa** mora em `actions/ativos.ts` e que ela **consulta por filial** (fato 16), e que por isso a
consulta global de `compras.ts` é um defeito (fato 15). **A medição refuta a premissa:**

- `filialComMesmaIdentidade` (`actions/ativos.ts:53-80`) é **GLOBAL** — `.eq('patrimonio', …)` sem cláusula de
  filial — e o comentário acima dela se chama, literalmente, *"A CHECAGEM GLOBAL DE IDENTIDADE, que virou a ÚNICA
  linha de defesa"*.
- `devolucao-fornecedor.ts:72-75` (o substituto) também é global. São **três** checagens globais, não uma.
- `criar_compra_lote` (corpo vigente na `0064`) não confere identidade: depende só do índice, que é por filial
  desde a `0091`. Ou seja, **a pré-checagem global de `compras.ts` é a única coisa que hoje impede uma compra de
  abrir conflito entre filiais.**
- É uma regra escrita em **três** lugares de autoridade: `docs/ESPECIFICACAO.md` §10.2 (autoridade nº 1 —
  *"o conflito só nasce do import: cadastro manual, corrigir patrimônio e definir service tag continuam recusando
  par que exista em qualquer filial"*), `docs/DECISOES.md` (F24, 30/07/2026 — *"`compras.ts` e
  `devolucao-fornecedor.ts` já consultavam sem filtro de filial — os dois continuam corretos sozinhos"*) e a
  regra permanente 2 do `CLAUDE.md`.

**Escolha:** a régua 1 da ordem (a medição) e a hierarquia do `CLAUDE.md` (a spec manda) ganham. A Frente E
**unifica** as três consultas numa régua só (`src/lib/ativos/identidade.ts`) e **preserva** a recusa em qualquer
filial. A compra com patrimônio repetido em OUTRA filial **continua recusada**. Isso fica no topo do relatório como
a decisão que o Johnny precisa confirmar: se a intenção dele é revogar o §10.2 para a compra, a troca é uma linha
(o alcance da consulta, que passa a morar num lugar só) — mais uma emenda na spec. Reverter no sentido oposto, se a
fase tivesse aplicado a decisão i e o Johnny não a quisesse, exigiria desfazer conflitos já criados em produção.

---

## 2. O desenho

### 2.1 `src/lib/auth/recorte-leitura.ts` — o que uma sessão pode ler

```ts
export type UnidadeDoRecorte = { readonly id: number; readonly slug: string }

export type RecorteDeLeitura =
  | { readonly alcance: 'universal' }
  | {
      readonly alcance: 'restrito'
      readonly unidades: readonly UnidadeDoRecorte[]
      readonly alcancaSemUnidade: boolean
    }

export const RECORTE_UNIVERSAL: RecorteDeLeitura

/** O ponto de injeção da F70/F72. Hoje: universal, para toda sessão (ADR-001/002). */
export function recorteDe(sessao: SessaoDoRecorte): RecorteDeLeitura
```

`SessaoDoRecorte = { readonly papel: PapelUsuario } | null | undefined` — o menor recorte estrutural que
`Operador`, `Permissoes` e `OperadorDoFiltro` satisfazem; `null` é o visualizador por senha e a sessão sem perfil.
O parâmetro é recebido e deliberadamente não consultado (`void sessao`), no molde de `escopoDoImportLog`.

**Por que "universal" com nome, e não lista vazia:** a lista vazia é exatamente o valor que esta fase proíbe de
significar "tudo". O recorte restrito carrega `id` E `slug` porque as duas famílias de filtro existem de propósito
(§2.3) e porque, depois da virada, slug repete entre empresas — só o recorte sabe qual `matriz` é a da sessão.

### 2.2 `UnidadesEfetivas` — o tipo que não sabe mentir

```ts
declare const MARCA: unique symbol   // (um `Symbol` real em runtime; não exportado)
export type FamiliaDeUnidade = 'id' | 'slug'
export type UnidadesEfetivas<F extends FamiliaDeUnidade = 'id'> = {
  readonly [MARCA]: { readonly familia: F; readonly vista: VistaDasUnidades<ValorDaFamilia<F>> }
}

export type VistaDasUnidades<T> =
  | { readonly modo: 'todas' }
  | { readonly modo: 'lista'; readonly valores: readonly [T, ...T[]]; readonly incluiSemUnidade: boolean }
  | { readonly modo: 'somente-sem-unidade' }
  | { readonly modo: 'nenhuma' }

export function efetivar(recorte: RecorteDeLeitura, selecao: SelecaoDeUnidades): UnidadesEfetivas<'id'>
export function efetivar(recorte: RecorteDeLeitura, selecao: SelecaoDeUnidadesPorSlug): UnidadesEfetivas<'slug'>
export function lerUnidades<F extends FamiliaDeUnidade>(u: UnidadesEfetivas<F>): VistaDasUnidades<ValorDaFamilia<F>>
```

- **O brand é uma chave `unique symbol` não exportada, e o dado mora SOB ela.** Consequência medida (será provada
  pela sabotagem A): objeto literal, `{…} as UnidadesEfetivas`, `number[]` e `[] as UnidadesEfetivas` são todos
  recusados pelo `tsc` — nenhum dos três tipos se sobrepõe ao outro. A única fuga que o TypeScript não fecha é a
  dupla asserção (`as unknown as`); essa é fechada por uma trava de fonte em `recorte.test.ts`, que reprova
  qualquer `as UnidadesEfetivas`/`as unknown as UnidadesEfetivas` fora de `recorte-leitura.ts`.
- **Lista vazia é irrepresentável:** `valores` é tupla não-vazia. Onde a interseção esvazia, o modo é `nenhuma`,
  com nome. `lista` com `valores.length > 0` como teste de "tem filtro?" deixa de ser uma pergunta possível.
- **Por que `efetivar` é operação e não identidade** (o argumento de `pertenceAoEscopo`): alimentada com um
  `RecorteDeLeitura` restrito, ela intersecta — e há teste de EFEITO que prova. Quem a reescrever como
  `return selecao as …` derruba esse teste.
- **Nunca atravessa a fronteira do RSC:** chave de símbolo não serializa. O tipo vive entre a página/action e a
  query. Para props de componente, a página deriva valores simples da `vista`.

### 2.3 As seleções — `src/lib/filtros/filial.ts`

```ts
export type SelecaoDeUnidades =
  | { readonly familia: 'id'; readonly modo: 'todas' }
  | { readonly familia: 'id'; readonly modo: 'lista'; readonly ids: readonly number[] }

export type SelecaoDeUnidadesPorSlug =
  | { readonly familia: 'slug'; readonly modo: 'todas' }
  | { readonly familia: 'slug'; readonly modo: 'lista'; readonly slugs: readonly string[]; readonly incluiSemUnidade: boolean }

selecaoDeUnidades(param, sessao, filiaisAtivas)            // era resolverFiliaisIds
selecaoDeUnidadesPorSlug(param, sessao, filiais)           // era resolverFiliaisSlugs
selecaoDeUnidadesSemPadrao(param)                          // era resolverFiliaisSlugsSemPadrao (comentário F25 §4.7 intacto)
unidadesMarcadasPorPadrao(papel, escopoEscrita, ativas)    // era filtroFilialPadrao (auth/papeis.ts)
```

**Divergência declarada da forma da ficha:** a ficha escreve `{ modo: 'todas' } | { modo: 'lista'; ids }`, sem
`familia`. Sem ela, `efetivar` não sabe, diante de `todas` com um recorte restrito, se deve devolver os ids ou os
slugs do recorte. O campo é o preço de a interseção ser real.

### 2.4 O terceiro valor (decisão 3)

"Linha que não pertence a unidade nenhuma" é o consolidado de `/relatorios/gerados` (`filial_id is null`). Forma:
**flag `incluiSemUnidade` ao lado da lista + um modo nomeado `somente-sem-unidade`**. O flag porque "consolidado" é
ortogonal às filiais (`?filial=geral,bravo` pede os dois); o modo porque `?filial=geral` sozinho seria uma lista
vazia com flag — e lista vazia é o valor que a fase proíbe. Em `todas`, as linhas sem unidade entram (é o
comportamento de hoje). Só a seleção por slug **sem padrão** produz o flag (é a única família cuja tela aceita
`geral`); `/pendencias` continua tratando `geral` como um slug qualquer, como hoje.

### 2.5 O consumo nas queries

- `src/lib/queries/recorte-consulta.ts` (`server-only`): `recortarPorUnidade(query, coluna, unidades)` — o único
  lugar que traduz a vista em filtro do PostgREST, com `switch` exaustivo:
  `todas` → nada · `lista` → `.in()` (ou `.or(col.is.null, col.in.(…))` com o flag) · `somente-sem-unidade` →
  `.is(col, null)` · `nenhuma` → `.is(col, null).not(col, 'is', null)` (filtro garantidamente falso).
  **Por que não `.in(col, [])`:** a documentação do PostgREST v14 (Context7, conferida em 14/09/2026) não documenta
  o `in.()` vazio; a F57 não aposta comportamento de produção em algo não documentado.
  O cast estrutural fica contido nesta função — o mesmo desenho, e o mesmo motivo, de `aplicarFiltrosAtivos`.
- Consumidores que não são builder (ramificam por tamanho, ou somam em memória) fazem `switch` sobre
  `lerUnidades(...)`: `getSaldosItensDeFiliais`, `contarGruposConflito`, `listarConflitos(ParaExport)`,
  `listarRelatoriosGerados`, `saldoDoRecorte`/`montarLinhasDeItem`, `escopoDosNumeros`.

---

## 3. A matriz de casos-limite — ANTES do refactor

`src/lib/filtros/casos-limite.test.ts`, rodada contra o código de hoje e gravada em
`docs/f57-evidencias/casos-limite-antes.md` antes de o primeiro byte de `filtros/filial.ts` mudar.

**Eixos.** cargo ∈ {dev, admin, operador, consulta} × vínculos ∈ {nenhum `[]`, um `[2]`, dois `[2,4]`, só em
filial desativada `[5]`} × parâmetro ∈ {ausente, `todas`, válido, inexistente, de filial desativada, lixo}.
Catálogo fictício: ativas `alfa(1) bravo(2) charlie(3) delta(4)`, desativada `extinta(5)`, inexistente `77`/`fantasma`.

**Superfícies (colunas).**
- **S1 — por id, com padrão** (`/ativos`, `/movimentacoes`, `/itens`, `/itens/historico` e o CSV): o recorte efetivo.
- **S2 — por slug, com padrão** (`/pendencias`, o CSV da fila e da mesa, o selo e o card do dashboard).
- **S3 — por slug, sem padrão** (`/relatorios/gerados`): o FILTRO que `listarRelatoriosGerados` monta, capturado
  por um client falso que grava a cadeia de chamadas (sem banco).
- **S4 — a aba padrão** de `/relatorios` (sem parâmetro).
- **S5 — `/itens/conferencia`**: `seletor` · `aviso-sem-escrita` · `filial:<id>`.
- **P — pertinência na rota**: `abre` · `404`.

**Os três casos documentados, e o que cada um precisa mostrar ANTES e DEPOIS:**
1. consolidado (`filial_id is null`) aparece em `/relatorios/gerados` sem parâmetro, com `todas`, com `geral` e com
   `geral,<slug>`;
2. slug/id de filial desativada continua recortando (S1, S2, S3);
3. operador sem vínculo (ou só em desativada) cai em `todas` nas leituras, e cai no ⚠ de escrita na conferência.

**Mudança declarada (a única):** coluna P passa de `abre` a `404` para parâmetro inexistente nas sete rotas que ainda
não recusavam. Qualquer outra linha que mudar é regressão.

---

## 4. As frentes, os commits e os lotes

| # | Frente | Commit(s) | Verde entre um e outro |
|---|---|---|---|
| 0 | matriz ANTES | `test(f57): a matriz de casos-limite, rodada contra o codigo de hoje` | test |
| A | `recorte-leitura.ts` + `recorte.test.ts` | `feat(f57): o recorte de leitura e o tipo que so efetivar produz` | tsc · lint · test |
| B | `filtros/filial.ts` reescrito + `unidadesMarcadasPorPadrao` | `refactor(f57): a selecao de unidades desfaz o achatamento` | idem |
| C | rename nas três camadas | `refactor(f57): escopo de escrita com o mesmo nome nas tres camadas` | idem |
| D | `unidades/slugs.ts` + trava | `refactor(f57): os slugs reservados numa fonte so` | idem |
| E | `ativos/identidade.ts` | `test(f57): a regua de identidade...` (vermelho) → `refactor(f57): ...` (verde) | idem |
| F | pertinência + `rotas.test.ts` | `feat(f57): filial inexistente na URL responde 404` | idem |
| G | `chave-versao-sql.test.ts` | `test(f57): a chaveVersao travada contra o SQL` | idem |
| H1 | `lib/queries/relatorios/**` | `refactor(f57): lote 1 — queries de relatorio` | idem |
| H2 | resto de `lib/queries/**` | `refactor(f57): lote 2 — queries` | idem |
| H3 | `lib/actions/**` | `refactor(f57): lote 3 — actions` | idem |
| H4 | `src/app/**`, `src/components/**`, `lib/itens` em memória; sai o legado | `refactor(f57): lote 4 — telas e o fim do legado` | idem + build |
| I | versão, docs, relatório, PR, tag | `docs(f57): ...` / `chore(f57): 1.62.0` | tudo + build |

**O legado transitório (declarado).** A Frente B troca o retorno de `filtros/filial.ts`, e os 18 consumidores só
migram nos lotes H. Para `tsc` ficar verde entre os commits sem uma cópia do parser em cada chamador, os três
nomes antigos continuam existindo **até o lote H4** como invólucros finos sobre as funções novas, marcados
`@deprecated F57 — transitório, sai no lote 4`, dentro de `filtros/filial.ts`. É ali — e só ali — que o `[]` sobrevive
até o H4. O critério 5 é sobre o estado final.

**Arquivos por lote (medidos pela cadeia do explorador (a)):** H1 = 1 (`relatorios/pendencias.ts`, + o chamador
`relatorios/snapshot.ts`) · H2 = 6 (`ativos`, `movimentacoes`, `itens`, `pendencias-detalhe`, `conflitos`,
`gerados`) + `recorte-consulta.ts` · H3 = 1 (`exportar.ts`) · H4 = 8 páginas + `layout.tsx` + 2 módulos de `lib/itens`
+ `filtros/filial.ts` (o legado sai). Uma assinatura trocada num lote arrasta o chamador no MESMO commit — senão o
`tsc` não fica verde entre eles.

**Reversão.** Sem banco: `git revert` dos commits na ordem inversa (I → H4 → … → A), e redeploy. Os lotes existem para
que a reversão possa parar no meio.

---

## 5. As nove decisões

1. **`RecorteDeLeitura`** — união com `alcance: 'universal' | 'restrito'`; `recorteDe` recebe o menor recorte
   estrutural (`{ papel } | null | undefined`), que os três tipos casados já satisfazem, e ignora-o hoje com `void`.
2. **`UnidadesEfetivas`** — brand por chave `unique symbol` não exportada, dado sob a chave, leitura só por
   `lerUnidades`; por FAMÍLIA (`'id' | 'slug'`), nunca as duas juntas; `efetivar` intersecta de verdade.
3. **O terceiro valor** — flag `incluiSemUnidade` na lista + modo `somente-sem-unidade`; `nenhuma` com nome.
4. **O alcance do rename** — `filiaisDeEscrita`→`escopoDeEscrita`, `filiaisEscrita`→`escopoEscrita` nos TRÊS tipos
   (inclusive `OperadorDoFiltro`) e em toda prop/variável/parâmetro, `podeEscreverNaFilial`→`podeEscreverNoEscopo`.
   **Ficam:** `escreveNaFilial` (pergunta sobre UMA filial dada — o nome continua verdadeiro; só o parâmetro vira
   `escopoEscrita`) e `filiaisParaEscrita` (devolve objetos de FILIAL para o select — verdadeiro).
   `filiaisEscritaSchema` (`validators/admin.ts`) fica: é o campo de VÍNCULOS do formulário de usuário
   (`operador_filiais`), não o escopo derivado — justificativa nominal no relatório. Props com NOMES de filial
   (`app-header`/`user-menu`) viram `nomesDoEscopoEscrita` (formato diferente, nome diferente). A regex de
   `permissoes.test.ts` (`\bfiliais\w*…`) é estendida a `escopo\w*` no mesmo commit, senão a trava fica cega.
5. **`unidades/slugs.ts`** — `SLUG_CONSOLIDADO = 'geral'`, `FILIAL_TODAS = 'todas'`, `SLUGS_RESERVADOS`;
   `url-params.ts`, `papeis.ts` (`ABA_RELATORIO_CONSOLIDADO`) e `validators/admin.ts` passam a ler dali. Trava por
   AST do TypeScript (a dependência já existe): literal exato `'geral'`/`'todas'` em `src/lib/**` (não-teste) fora do
   módulo reprova; discriminante de estado (`modo`/`tipo`) só nos arquivos da allowlist nominal, cada um com motivo.
   `ajuda/registry.ts` não é tocado; o comentário do homônimo vai em `slugs.ts` e em `validators/admin.ts` (a antiga
   casa do nome) — é a leitura possível de "os dois módulos" com o registry intocável.
6. **A régua de identidade** — `chaveDeIdentidadeSemUnidade(patrimonio, serviceTag)` (espelho EXATO de
   `chave_identidade_ativo`, `0099`, com prefixo de comprimento) e `chaveDeIdentidade(unidadeId, patrimonio,
   serviceTag)` (o índice da `0091`, `filial_id` à esquerda). Uma função de consulta só, `identidadesNoAcervo`, que as
   três actions chamam; o ALCANCE da recusa manual é uma constante nomeada (`todas as unidades`, spec §10.2).
   A lógica de recusa da compra sai para função pura testável (não há precedente de action com Supabase mockado).
   Trava: `identidade-sql.test.ts` (TS↔SQL) + `identidade.test.ts` (efeito dos dois lados) + guarda de régua única.
7. **O helper de pertinência** — `recusarFilialInexistente(client, param, familia, { aceitaConsolidado? })` em
   `src/lib/unidades/pertinencia.ts` (`server-only`): parseia com o parser de sempre; só consulta quando há lista;
   consulta `filiais` SEM filtro de `ativo` (desativada existe); qualquer valor inexistente → `notFound()`. Lixo
   continua ignorado pela doutrina do parser — inclusive `99999`, que está fora da faixa `smallint` (o exemplo de
   404 do roteiro é `9999`). Núcleo puro `valoresInexistentes` testado. `rotas.test.ts` descobre as rotas pelo disco
   (`limpar()` + regex de `<sp>.filial`, desestruturação de `params` e assinatura `params: Promise<{ filial`).
8. **Os lotes e a classificação do inventário** — lotes do §4; classificação por (operação × client): SELECT pelo
   client de sessão → "confia na RLS" (F66); INSERT/UPSERT → "precisa de `empresa_id` explícito" (a F63 derruba o
   default); UPDATE/DELETE por sessão → "confia na RLS" na leitura do alvo, escrita por tenant na F67; qualquer leitura
   pelo client administrativo ou pelo client do visualizador → "precisa de `empresa_id` explícito" (F67/F68).
   Classificação por workflow (um leitor por arquivo + verificação adversarial), com a contagem conferida por script.
9. **O laço da `chaveVersao`** — `chaveVersao` muda para `relatorios/versao-snapshot.ts` (puro, exportado) e a trava lê
   a `unique` da `0010` e o índice da `0013` do disco. Registro para a F65: a chave ganha `empresa_id` junto com o
   índice novo, e `ehViolacaoDeVersao` casa pelo NOME `relatorios_gerados_periodo_filial_versao_uidx` — as duas pistas
   quebram juntas. Nada disso é consertado aqui.

---

## 6. Os 18 consumidores da convenção `[] = todas` (o alvo dos lotes)

`queries/ativos.ts` (`listarAtivos`, `listarAtivosParaExport` via `aplicarFiltrosAtivos`) · `queries/movimentacoes.ts`
(`listarMovimentacoes`) · `queries/itens.ts` (`getSaldosItensDeFiliais`, `getHistoricoLancamentos`,
`listarHistoricoParaExport`) · `queries/pendencias-detalhe.ts` (`contarPendenciasAbertas`, `listarPendencias`,
`listarPendenciasParaExport`) · `queries/conflitos.ts` (`contarGruposConflito`, `contarConflitosAbertos`,
`listarConflitos`, `listarConflitosParaExport`) · `queries/gerados.ts` (`listarRelatoriosGerados`) ·
`queries/relatorios/pendencias.ts` (`getPendencias`) · `itens/lista.ts` (`saldoDoRecorte`, `montarLinhasDeItem`) ·
`itens/escopo.ts` (`escopoDosNumeros`). Mais o card inline do dashboard (`(app)/page.tsx:134`).

**Fora do alvo, com motivo:** `filialParaRpc`/`p_filial` singular (`null` = consolidado, UMA filial — outro conceito;
é da F58/F60); `cidadesDasFiliais` e `aplicarCargoEVinculos` (vazio = nenhuma, semântica oposta); o `p_filial null =
global` das RPCs da Zona destrutiva (escopo de EXCLUSÃO com confirmação digitada — é da F67).

---

## 7. O inventário — `docs/INVENTARIO-LEITURAS.md`

Uma linha por call-site `.from('ativos'|'movimentacoes'|'lancamentos_item'|'pendencias_item'|'colaboradores')` em
`src/**` (não-teste): arquivo · linha · função · tabela · operação · client · classificação · por quê (uma linha) ·
fase de destino. A soma por arquivo é conferida contra a varredura do disco no fechamento; `scripts/**` fica fora
(ferramentas de service role que não servem tela), com a contagem medida à parte.

## 8. O que este plano deliberadamente não faz

Migration; `empresa_id`; rota ou URL nova; estreitar leitura; tocar `ajuda/registry.ts`; `filialParaRpc`; a porta
única de RPC; a unique do snapshot; corrigir `ehFiltroDeFilial` para a família id (achado: `?filial=abc` em `/ativos`
diz "filtro" e aplica o padrão — backlog); `typeof sp.filial === 'string'` em `/relatorios/gerados` (param repetido é
descartado — backlog); a ambiguidade do separador `::` em `chavePatrimonio` do motor de import (backlog).
