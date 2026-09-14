# F57 — Os quatro significados de filial, e o fim do fail-open

Ordem de serviço da fase **F57** do `PLANO-MULTIEMPRESA.md` (§5, Bloco D). Fase **só de código**: nenhuma migration,
nenhuma tela nova, nenhum `empresa_id`. O que ela entrega é **forma** — o lugar onde o recorte de leitura vai morar na
virada, e um tipo que torna *irrepresentável* o estado "sem recorte".

O plano a chama de *"o único item cujo custo cresce de forma irreversível se ficar para depois"* (§3 e §9): hoje é
refatoração de tipos com o compilador de rede e zero mudança de comportamento; depois é a mesma refatoração **na
fronteira de autorização, em produção, com dois clientes**.

---

## Estado de partida — os 20 fatos medidos no disco de hoje (14/09/2026)

> O prompt cita estes fatos **pelo número**. Eles foram medidos contra a árvore de hoje, não copiados da ficha — e onde
> divergem dela, a divergência está marcada. O prompt manda o agente **remedir antes de aceitar**.

**Onde o projeto parou**

1. `package.json` em **`1.61.0`**; última migration **`0140_import_desarma_fk.sql`** (141 arquivos em
   `supabase/migrations/`; a `0029` é gap real). A F56 fechou com relatório em `docs/RELATORIO-F56.md`.
   A F57 **não tem migration** — a ficha não pede nenhuma, e o "Não entra" dela exclui `empresa_id`.
   Versão da fase: **`1.62.0`** (regra permanente 8: fase invisível ao operador também ganha versão).

**O tamanho real da refatoração**

2. `.from('ativos'|'movimentacoes'|'lancamentos_item'|'pendencias_item'|'colaboradores')` em `src/lib/queries/**` +
   `src/lib/actions/**`, fora de arquivo de teste: **116 ocorrências em 20 arquivos** — a ficha estima ~109.
   A distribuição (é o orçamento das F63–F67, e o motivo de o inventário ser a entrega mais valiosa da fase):

   | Arquivo | n | Arquivo | n |
   |---|---:|---|---:|
   | `queries/import-logs.ts` | 13 | `queries/colaboradores.ts` | 6 |
   | `queries/dev-destrutivo.ts` | 11 | `actions/colaboradores.ts` | 6 |
   | `queries/movimentacoes.ts` | 10 | `queries/relatorios/movimentacoes.ts` | 4 |
   | `queries/ativos.ts` | 10 | `actions/movimentacoes.ts` | 4 |
   | `actions/termos.ts` | 10 | `actions/itens.ts` | 4 |
   | `actions/ativos.ts` | 8 | `queries/relatorios/itens.ts` | 3 |
   | `queries/itens.ts` | 7 | `actions/pendencias.ts` | 3 |
   | `queries/relatorios/estoque.ts` | 6 | `actions/compras.ts` | 2 |
   | `queries/compras.ts` | 6 | `queries/pendencias-detalhe.ts` · `actions/devolucao-fornecedor.ts` · `actions/admin.ts` | 1 cada |

3. Referências dos quatro nomes que a fase troca (`grep -r` em `src/**/*.ts{,x}`, incluindo import, definição e
   chamada): `resolverFiliaisIds` **25** · `resolverFiliaisSlugs` **15** · `resolverFiliaisSlugsSemPadrao` **7** ·
   `filtroFilialPadrao` **19** · `filiaisDeEscrita` **23** · o campo `filiaisEscrita` **53** · `escreveNaFilial` **20**
   · `abaRelatorioPadrao` **14** · `exigirEscritaEm` **17** · `podeEscreverNaFilial` **8**.

**O achatamento que a fase desfaz**

4. A ficha está certa e o trabalho é menor do que parece: `selecaoFilialIds`/`selecaoFilialSlugs`
   (`src/lib/url-params.ts:100-103`) **já devolvem** `SelecaoFilial<T> = {modo:'padrao'} | {modo:'todas'} |
   {modo:'lista'; valores:T[]}`. Quem achata é `src/lib/filtros/filial.ts` — 97 linhas, três funções exportadas, e
   dois `if (sel.modo === 'todas') return []` (linhas 40 e 61). **Desfazer o achatamento é deixar de chamar
   `return []`.**
5. A convenção está escrita em caixa alta no cabeçalho do módulo: *"`[]` = SEM RECORTE (todas as filiais). É o mesmo
   valor para 'cargo que vê tudo' e para 'sentinela `filial=todas`'"*. É exatamente essa frase que a fase mata.

**Onde a ficha erra o endereço**

6. **`podeEscreverNaFilial` não mora em `src/lib/auth/papeis.ts`.** Mora em
   `src/components/layout/permissoes.ts:44`, com **8 referências, todas em `src/app/**`**
   (`ativos/[id]`, `itens`, `itens/conferencia`, `movimentacoes/devolucao-fornecedor`).
   A tabela da ficha põe os três nomes de escrita em `auth/papeis.ts`; dois estão lá (`filiaisDeEscrita`,
   e `escreveNaFilial`, que é o predicado de AVISO da F28), o terceiro não.
7. O campo aparece em **dois tipos**: `Operador.filiaisEscrita: readonly number[]` (`src/lib/auth/acesso.ts:27`) e
   `Permissoes.filiaisEscrita: readonly number[]` (`src/components/layout/permissoes.ts:29`). O segundo é um recorte
   estrutural do primeiro **de propósito** (para nenhuma tela importar o módulo `server-only`) — renomear um sem o
   outro quebra esse casamento em silêncio, e o `readonly` existe porque `getOperador` é memoizada por request e o
   array é compartilhado por referência entre layout e página.

**As oito rotas**

8. As **8 rotas** que leem filial da URL, confirmadas uma a uma: `/ativos` (`sp.filial`, :107 e :122), `/itens`
   (:128, :199), `/itens/conferencia` (:58), `/itens/historico` (:106, :166), `/movimentacoes` (:76, :107),
   `/pendencias` (:98, :104, :107), `/relatorios/gerados` (:58) e `/relatorios/[filial]` — esta por
   **`params.filial`** (`:73-76`), não por `searchParams`. A conta da ficha bate.
9. O molde da validação de pertinência existe em `/itens/conferencia:58-59`:
   `const filialId = podeEscreverNaFilial(operador, filialPedida) ? filialPedida : null` — e o comentário ao lado diz
   que **é ergonomia, não trava** ("a trava real é a policy `operador lanca`"). Hoje um id fora do alcance cai no
   seletor, calado.
10. ⚠ **Armadilha**: `filtros/filial.ts:66-69` preserva **de propósito** slug de filial **DESATIVADA**
    (*"mudá-lo seria alterar em silêncio o sentido de links antigos"*). E ADR-001/ADR-002 dão leitura do sistema
    inteiro a todo cargo — id de outra filial é **legítimo** nas sete rotas de leitura. Logo "alheio", aqui, só pode
    significar **"não existe em `filiais`"**. É o que a decisão 2 do Johnny fixa.

**A `chaveVersao` e o índice**

11. `src/lib/queries/gerados.ts:57-59`: `chaveVersao(periodoDe, periodoAte, filialId)` devolve
    `` `${periodoDe}|${periodoAte}|${filialId ?? 'geral'}` `` — **espelho em TypeScript** da unique
    `(periodo_de, periodo_ate, filial_id, versao)` das migrations `0010`/`0013`, **sem trava nenhuma**. É a mesma
    classe de `colaborador_chave`/`chave-sql.test.ts`, que esta casa já travou seis vezes.
12. Ela alimenta a badge "superada" por uma consulta em `gerados.ts:172-178` — `.select('periodo_de, periodo_ate,
    filial_id, versao').in('periodo_de', datas)`, **sem recorte nenhum** —, com `registrarFalha` e degradação para
    `Map` vazio. Na virada, consolidado da empresa A e da empresa B produzem a chave idêntica `periodo|periodo|geral`.
13. `src/lib/relatorios/versao-snapshot.ts:41-48` casa a violação **pelo nome do índice**
    `relatorios_gerados_periodo_filial_versao_uidx` (a segunda pista, porque nem todo caminho do PostgREST preserva o
    `code` 23505). A F65 recria esse índice com `empresa_id` — e mata a pista. Aqui só se registra o laço; o conserto
    é lá.

**Os homônimos de slug**

14. Quatro lugares, e **um deles é homônimo sem relação**:
    - `src/lib/validators/admin.ts:286` — `const SLUGS_RESERVADOS = ['todas','geral'] as const`, **privado**;
    - `src/lib/queries/gerados.ts:63` — `const SLUG_CONSOLIDADO = 'geral'`, privado;
    - `src/lib/auth/papeis.ts:204` — `export const ABA_RELATORIO_CONSOLIDADO = 'geral'`;
    - `src/lib/ajuda/registry.ts:133` — `export const SLUGS_RESERVADOS: readonly string[] = ['manual']` → **slug de
      página de AJUDA, nada a ver com filial**. A ficha o nomeia justamente para não ser arrastado.
    Mais os literais soltos: `src/lib/actions/relatorios.ts:79,80,242,243`, `queries/relatorios/snapshot.ts:48`,
    `queries/relatorios/pendencias.ts:119`, e a sentinela `FILIAL_TODAS` em `url-params.ts`.

**A identidade do ativo**

15. O defeito é em **`src/lib/actions/compras.ts:63-85`** (não em `queries/compras.ts`, que a ficha parece indicar):
    `chavePatrimonio(it.patrimonio, it.service_tag)` de `@/lib/patrimonio`, e depois
    `.select('patrimonio, service_tag').in('patrimonio', patrimonios)` — **sem `.eq('filial_id', …)`**.
16. E existe a régua CERTA, no mesmo repositório: `src/lib/actions/ativos.ts:51-75`
    (`filialComMesmaIdentidade`), cujo comentário diz *"A régua espelha `chave_identidade_ativo` (migration 0092)"* e
    que consulta **por filial**, com `coalesce(service_tag,'')` espelhando o índice. A `0091`
    (`identidade_por_filial.sql`) tornou o índice por filial; a `0092` criou a função. **Duas réguas de identidade
    convivem hoje**, e a errada é a global.
17. ⚠ Por que um classificador por identificador não pegaria: em `compras.ts` a identidade aparece como **QUERY**
    (`.in('patrimonio', …)`), não como nome. É o argumento da ficha, e ele se confirma.

**O que já existe e serve de molde**

18. `src/lib/escopo/chave.ts` (`chaveDoEscopo()`, F50) e `src/lib/escopo/pertencimento.ts` (`EscopoDeGestao`,
    `escopoDeGestaoAtual`, `pertenceAoEscopo`, F54) já são o **molde de no-op verificável** desta casa: *"E o que ele
    NÃO é: `return true`. Uma função que devolve `true` literal é indetectável por EFEITO"*. `recorte-leitura.ts`
    nasce no mesmo molde — `efetivar` é a identidade hoje, mas é uma **operação de verdade** sobre dois operandos.
19. `src/components/layout/permissoes.ts:70` (`podeLer`, F50) já tem o ponteiro escrito: *"O que ela NÃO responde:
    'pode ler O QUÊ'. **Recorte por filial é F57**"*. O ponto de injeção está lá, esperando.
20. `src/lib/tipos-estritos.ts` (`ExcluirDaUniao`, F56) é o molde de utilitário de tipo puro; `src/lib/unidades/` já
    existe (`dono-do-termo.ts`), então `slugs.ts` entra ao lado; `src/lib/ativos/` existe (5 arquivos), e
    `identidade.ts` é novo. Scripts disponíveis: `npm run lint|test|build`, `npx tsc --noEmit`, `npm run db:test`,
    `npm run db:test:mutations`, `npm run verificar:actions`. **Sem migration, `db:lock` e `db:types` não entram.**

---

## As quatro decisões do Johnny (14/09/2026)

1. **`compras.ts` é consertado de verdade.** A F57 alinha `actions/compras.ts` com o índice `0091` e a função `0092`
   via o novo `chaveDeIdentidade(unidadeId, patrimonio, serviceTag)`. O comportamento muda, e a mudança é o conserto:
   patrimônio repetido em **outra** filial deixa de bloquear a compra — que é a regra que o banco já aplica desde a
   `0091` e que `actions/ativos.ts` já segue. Teste cobre os dois lados (mesma filial recusa, outra filial passa).
2. **A recusa nas 8 rotas é `notFound()`, e só para filial que NÃO EXISTE.** Filial desativada continua respeitada
   como hoje (fato 10); ninguém é barrado por ler outra filial. A única tela que muda de comportamento é a que hoje já
   está quebrada — id inexistente virava lista vazia ambígua.
3. **Uma run, uma PR, lotes internos** — o padrão do projeto. O tipo nominal faz o compilador achar os call-sites,
   então o risco de esquecer um é do compilador, não do grep.
4. **O rename vale nas três camadas**: `src/lib/**`, `src/components/**` e `src/app/**`. Vocabulário meio trocado é
   pior que qualquer um dos dois extremos.

---

## As frentes, e por que nesta ordem

- **A — o tipo que não sabe mentir.** `recorte-leitura.ts` + `UnidadesEfetivas` (*branded*) + `efetivar()`. Nada usa
  ainda; a trava de tipo nasce aqui.
- **B — o achatamento desfeito.** `filtros/filial.ts` reescrito para `SelecaoDeUnidades`. Depende de A porque o retorno
  novo já entra casado com `efetivar`.
- **C — o vocabulário de escrita.** `escopoDeEscrita` / `escopoEscrita` / `podeEscreverNoEscopo`, nas três camadas.
  Mecânico e largo (76+ referências); vem cedo para não colidir com os lotes da H.
- **D — os slugs numa fonte só.** `src/lib/unidades/slugs.ts` + trava estreita em `src/lib/**`.
- **E — a identidade do ativo.** `src/lib/ativos/identidade.ts` + o conserto de `actions/compras.ts` (decisão 1).
- **F — as 8 rotas.** Helper único de pertinência + `notFound()` (decisão 2) + `rotas.test.ts` com `assert >= 8`.
- **G — a trava da `chaveVersao`.** `chave-versao-sql.test.ts` contra o SQL das `0010`/`0013`.
- **H — os 116 call-sites e o inventário.** O grosso. Lotes por superfície, `tsc` verde entre eles.
  `docs/INVENTARIO-LEITURAS.md` sai daqui — é a entrega mais valiosa da fase.
- **I — o fechamento.** `1.62.0`, CHANGELOG, `registry.ts` em linguagem de operador, ata, relatório, PR, merge, tag.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Executar a fase F57 do `docs/PLANO-MULTIEMPRESA.md` (§5, Bloco D): dar nome distinto a cada um dos quatro
significados hoje fundidos em "filial", criar o módulo onde o recorte de leitura vai morar na virada multiempresa, e
tornar IRREPRESENTÁVEL o estado "sem recorte" — trocando a convenção `[] = todas` por um tipo nominal que só uma
função produz. Ao terminar, o sistema faz exatamente o que fazia hoje, com uma exceção declarada (a identidade do
ativo em compras) e uma tela que deixa de mentir (filial inexistente na URL), e `docs/INVENTARIO-LEITURAS.md` existe
como o orçamento das fases F63–F67. Fase SÓ DE CÓDIGO: nenhuma migration, nenhum `empresa_id`, nenhuma rota nova.

# Contexto

## Leia antes de escrever qualquer código
- `docs/PLANO-MULTIEMPRESA.md` — §4 (as 10 regras comuns a todas as fases), §5 → a ficha **F57** (a FONTE DA VERDADE
  do escopo: onde esta ordem e ela divergirem sem declaração, vale a ficha — `docs/README.md`), §6 e as fichas de
  **F58** (o que ela herda das assinaturas que você muda), **F59**, **F60**, **F65** (a unique do snapshot) e **F63–F67**
  (quem vai consumir o inventário).
- `CLAUDE.md` e `AGENTS.md` — as regras permanentes, em especial a **8** (versionamento) e a de migrations.
- `docs/README.md` — a hierarquia de autoridade.
- `docs/ADR-001-rls-por-filial.md` e `docs/ADR-002-papeis-e-permissoes.md` — **por que todo cargo LÊ tudo hoje**. Isto
  decide a forma da Frente F: recorte de leitura é UNIVERSAL hoje, e esta fase não o estreita.
- `docs/RELATORIO-F56.md` §10 e `docs/RELATORIO-F50.md` — o backlog nomeado e o molde do `podeLer`.
- `docs/DIVIDA-TECNICA.md` e `docs/MATRIZ-REGRAS.md` — o que já está catalogado sobre filtro de filial e identidade.
- O código, nesta ordem: `src/lib/filtros/filial.ts` (inteiro, com o cabeçalho), `src/lib/url-params.ts` (a
  `SelecaoFilial<T>` que já existe), `src/lib/auth/papeis.ts`, `src/lib/auth/acesso.ts` (o tipo `Operador`),
  `src/components/layout/permissoes.ts`, `src/lib/escopo/chave.ts` e `src/lib/escopo/pertencimento.ts` (**o molde do
  no-op verificável — leia os dois cabeçalhos inteiros antes de desenhar `efetivar`**), `src/lib/queries/gerados.ts`,
  `src/lib/relatorios/versao-snapshot.ts`, `src/lib/actions/compras.ts`, `src/lib/actions/ativos.ts`
  (`filialComMesmaIdentidade`), `src/lib/tipos-estritos.ts`.
- As migrations que definem as réguas que você vai espelhar: `0010`, `0013` (a unique do snapshot), `0091`
  (`identidade_por_filial`), `0092` (`chave_identidade_ativo`), `0062`/`0072` (`pode_escrever_filial`).
- As ordens `docs/prompts/F50-*`, `F52-*` e `F54-*` — o vocabulário de "fechadura no-op" desta casa.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Vinte fatos, medidos em 14/09/2026 no cabeçalho de `docs/prompts/F57-quatro-significados-de-filial-ultracode.md`.
Remeça cada um contra o disco de hoje antes de agir; onde a sua medição contrariar o número escrito, **a sua medição
ganha**, desde que ela vá para o relatório. Os que mais importam:
- **fato 1** — versão `1.61.0`, última migration `0140`. Esta fase não cria migration; a versão dela é `1.62.0`.
- **fato 2** — são **116** call-sites `.from()` nas cinco tabelas, em 20 arquivos, não os ~109 da ficha. A tabela por
  arquivo está no cabeçalho.
- **fato 4** — `url-params.ts` **já** devolve `{modo}`; quem achata é `filtros/filial.ts`, em dois `return []`.
- **fato 6** — `podeEscreverNaFilial` mora em `src/components/layout/permissoes.ts:44`, NÃO em `auth/papeis.ts` como a
  ficha diz. São 8 referências, todas em `src/app/**`.
- **fato 7** — o campo `filiaisEscrita` existe em DOIS tipos (`Operador` e `Permissoes`), casados de propósito.
- **fato 10** — slug de filial DESATIVADA é preservado por decisão registrada (F25 §4.7), e todo cargo lê tudo
  (ADR-001/002). "Alheio" só pode significar "não existe".
- **fato 14** — `SLUGS_RESERVADOS` de `ajuda/registry.ts:133` é HOMÔNIMO SEM RELAÇÃO (slug de página de ajuda).
  Arrastá-lo para `unidades/slugs.ts` é defeito, não unificação.
- **fato 15/16** — o defeito da identidade é `src/lib/actions/compras.ts:63-85`, e a régua certa já existe em
  `src/lib/actions/ativos.ts:51-75`.

## Comandos que já existem — use, não reinvente
`npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run db:test` · `npm run db:test:mutations`
· `npm run verificar:actions`. **Não rode `db:seed`, `db:reset`, `db:lock` nem `db:types`** — esta fase não toca banco.

# Escopo

## Dentro — nove frentes, nesta ordem

### Frente A — o tipo que não sabe mentir
Crie `src/lib/auth/recorte-leitura.ts`, no molde de `src/lib/escopo/pertencimento.ts` (cabeçalho longo explicando o
que é hoje, o que será na virada, e POR QUE não é `return true`):
- `RecorteDeLeitura` — o que uma sessão pode ler. Hoje é universal por ADR-001/002, e isso é a RESPOSTA CORRETA, não
  um atalho: o tipo precisa representar "universal" explicitamente, com um nome, e não como lista vazia.
- `recorteDe(operador)` — o ponto de injeção da F70/F72. Recebe o que já existe (`Permissoes`/`Operador`), devolve
  `RecorteDeLeitura`.
- `UnidadesEfetivas` — **branded type**, produzido SÓ por `efetivar(recorte, selecao)`. Toda query e toda action
  passam a receber `UnidadesEfetivas`, nunca `number[]`/`string[]` cru. `efetivar` é a INTERSEÇÃO de verdade
  (recorte ∩ seleção), que hoje só recebe recorte universal — alimentada com um recorte restrito ela recorta, e há
  teste que prova exatamente isso, como `pertenceAoEscopo` faz.
- **O terceiro valor.** O tipo precisa representar "linha que não pertence a unidade nenhuma" — o consolidado com
  `filial_id is null` de `/relatorios/gerados`, que existe por decisão explícita da F25 §4.7. Sem ele a refatoração
  quebra aquela tela em silêncio, que é o defeito que a fase existe para evitar. Decida a forma (um terceiro modo, ou
  um flag ao lado) e registre o porquê.
- Decida e registre: se `UnidadesEfetivas` carrega ids, slugs, ou os dois (as duas famílias existem de propósito —
  `v_fila_pendencias.filial` e `v_conflitos_filiais.filial` expõem slug, `url-params.ts` documenta isso).

`src/lib/auth/recorte.test.ts` (ou `src/lib/filtros/recorte.test.ts`, como a ficha nomeia — escolha um e registre):
prova por `@ts-expect-error` que **não existe caminho de tipo** que produza `UnidadesEfetivas` sem passar por
`efetivar`, e que lista vazia não significa "tudo"; e prova por EFEITO que um recorte restrito recorta.

### Frente B — o achatamento desfeito
Reescreva `src/lib/filtros/filial.ts` preservando o cabeçalho (ele explica por que o módulo existe — F12·W6A) e
trocando o parágrafo da convenção `[]`:
- `SelecaoDeUnidades = { modo: 'todas' } | { modo: 'lista'; ids: readonly number[] }` (e a variante por slug).
- `resolverFiliaisIds` → `selecaoDeUnidades…` e `filtroFilialPadrao` → `unidadesMarcadasPorPadrao`, nos nomes da
  ficha. `resolverFiliaisSlugsSemPadrao` sobrevive com nome novo E com o comentário da F25 §4.7 intacto.
- Os dois `if (sel.modo === 'todas') return []` somem: o modo passa adiante.
- `src/lib/filtros/filial.test.ts` migra junto e GANHA os três casos-limite documentados na ficha, provados no código
  ATUAL antes de você mexer (ver "Verificação").

### Frente C — o vocabulário de escrita, nas três camadas (decisão 4)
`filiaisDeEscrita` → `escopoDeEscrita` (`auth/papeis.ts`); `Operador.filiaisEscrita` e `Permissoes.filiaisEscrita` →
`escopoEscrita`; `podeEscreverNaFilial` → `podeEscreverNoEscopo` (`components/layout/permissoes.ts`, fato 6).
`escreveNaFilial` (o predicado de AVISO da F28) e `filiaisParaEscrita`: decida se entram no rename e registre — o
critério é se o nome novo continua dizendo a verdade sobre o que a função faz.
Mantenha os `readonly` (fato 7) e os comentários que explicam POR QUE `eAdmin` e não `papel === 'admin'`.
**Não mude nenhum corpo nesta frente** — é rename e nada mais; qualquer mudança de comportamento aqui é defeito.

### Frente D — os slugs numa fonte só
`src/lib/unidades/slugs.ts` unifica `SLUGS_RESERVADOS` (`validators/admin.ts:286`), `SLUG_CONSOLIDADO`
(`queries/gerados.ts:63`), `ABA_RELATORIO_CONSOLIDADO` (`auth/papeis.ts:204`) e a sentinela `FILIAL_TODAS` de
`url-params.ts`. **Não toque em `ajuda/registry.ts:133`** (fato 14) — e deixe um comentário nos dois módulos dizendo
que são homônimos sem relação, para o próximo não repetir a dúvida.
Trava estreita: os literais `'geral'` e `'todas'` não aparecem em `src/lib/**` fora desse módulo — **`src/lib/**`, não
`src/**`**: `components/` tem textos legítimos, e a ficha avisa. Allowlist nominal e justificada para os testes e
para os comentários.

### Frente E — a identidade do ativo (decisão 1 do Johnny)
`src/lib/ativos/identidade.ts` com `chaveDeIdentidade(unidadeId, patrimonio, serviceTag)`, espelhando
`chave_identidade_ativo` (migration `0092`) e o índice por filial da `0091`, com o mesmo
`coalesce(service_tag,'')` que `actions/ativos.ts:74` já documenta.
`src/lib/actions/compras.ts:63-85` passa a recortar por filial. **Isto muda comportamento, de propósito**: patrimônio
repetido em OUTRA filial deixa de bloquear a compra, porque o banco já o permite desde a `0091`. `actions/ativos.ts`
passa a consumir o mesmo módulo, para não sobrar uma segunda definição.
Trava: teste que nasce VERMELHO contra o código de hoje, cobrindo os dois lados (mesma filial → recusa; outra filial →
passa), mais uma guarda de que a régua de identidade mora num lugar só.

### Frente F — as 8 rotas e a recusa explícita (decisão 2 do Johnny)
Helper único de pertinência (lugar e nome por sua conta; `src/lib/unidades/` é o candidato natural), chamado pelas
**8** rotas do fato 8. Régua, e ela é estreita de propósito:
- filial/slug que **não existe** em `filiais` → `notFound()`;
- filial **desativada** → continua valendo, como hoje (fato 10, decisão registrada da F25);
- filial de outra unidade → **continua abrindo**: todo cargo lê tudo (ADR-001/002). Esta fase NÃO estreita leitura.
- `/itens/conferencia` é o caso especial: ali o parâmetro governa ESCRITA, e o fallback para o seletor continua sendo
  o comportamento certo para "existe mas você não escreve nela". Não o troque por `notFound()`.
`src/lib/unidades/rotas.test.ts`: `assert` de que **pelo menos 8** rotas chamam o helper, por varredura do disco — não
por lista redigitada; uma rota nova que leia `filial` sem chamá-lo derruba o teste.

### Frente G — a trava da `chaveVersao`
`src/lib/relatorios/chave-versao-sql.test.ts`, no molde de `chave-sql.test.ts`/`patrimonio-sql.test.ts`: confere que
`chaveVersao` (`queries/gerados.ts:57`) espelha a unique das migrations `0010`/`0013`, lendo o SQL do disco — **não
uma cópia redigitada**. Case-insensitive (o SQL escreve com maiúscula em pontos).
Registre no relatório, para a **F65**, o laço completo: a `chaveVersao` ganha `empresa_id` lá, junto com o índice; e
`versao-snapshot.ts:43` casa a violação pelo NOME do índice (fato 13), que a F65 recria — as duas pistas quebram
juntas. **Não conserte nada disso aqui**; é escopo da F65.

### Frente H — os 116 call-sites e o inventário
O grosso da fase. Migre em **lotes por superfície**, na ordem: (1) `lib/queries/relatorios/**`; (2) o resto de
`lib/queries/**`; (3) `lib/actions/**`; (4) `src/app/**` e `src/components/**` no que a assinatura arrastar.
Entre um lote e outro: `npx tsc --noEmit`, `npm run lint`, `npm run test` verdes, e commit próprio.
**`lib/actions/**` não é opcional** — a ficha é explícita: é o lado em que o fail-open custa exclusão, não leitura.
`docs/INVENTARIO-LEITURAS.md`: os **116** call-sites (ou o número que você medir) listados arquivo a arquivo, com
linha, tabela e a classificação **"precisa de `empresa_id` explícito" × "confia na RLS"**, mais o porquê de cada
classificação em uma linha. Esta lista é o orçamento das F63–F67 e é a entrega mais valiosa da fase — trate-a como
entrega, não como apêndice.

### Frente I — o fechamento
`1.62.0` no `package.json`; entrada no `CHANGELOG.md`; entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6
mudanças **em linguagem de operador** (há teste que recusa termo de desenvolvedor — a única mudança que o operador
percebe é a recusa de filial inexistente); ata em `docs/DECISOES.md`; `docs/RELATORIO-F57.md`; tag anotada `v1.62.0`.
Atualize `docs/ARQUITETURA.md` (§10, "quero mudar X → mexo em Y") e `docs/README.md` com os módulos novos.

## Fora — não toque
`empresa_id` em lugar nenhum. Nenhuma migration (nem corretiva: se você achar defeito de banco, ele vai NOMEADO para o
backlog do relatório). Renomear a tabela `filiais` (§7 do plano). Qualquer mudança de rota ou de URL — os links
antigos têm de continuar valendo, `?filial=todas` incluído. O recorte de leitura NÃO é estreitado: nenhum cargo passa a
ver menos do que vê hoje. Não mexa em `ajuda/registry.ts`. Não antecipe a F58 (a porta única de RPC, `linhas.ts`,
`erros.ts` enumerável), a F59, a F60 nem a F65 (a unique com `empresa_id`, o índice novo). Não mexa no CI, na proteção
da `main`, em `.env*` nem em `scratchpad/`. Não rode nada contra produção — esta fase não tem o que rodar lá.

# Critérios de aceitação
1. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos.
2. `src/lib/auth/recorte-leitura.ts` existe, com `RecorteDeLeitura`, `recorteDe` e `efetivar`, e cabeçalho que explica
   o que é hoje, o que muda na virada e por que não é `return true`.
3. `UnidadesEfetivas` é nominal: não há como produzi-lo sem `efetivar`, e há `@ts-expect-error` que prova isso.
4. Não existe, em `src/lib/**`, função exportada que devolva "sem recorte" como lista vazia.
5. `filtros/filial.ts` devolve `SelecaoDeUnidades`; os dois `return []` de hoje não existem mais.
6. Os três casos-limite passam, provados ANTES e DEPOIS: consolidado com `filial_id is null` aparece em
   `/relatorios/gerados`; slug de filial desativada continua recortando; operador sem vínculo continua caindo em
   "todas", com o ⚠ que a tela já mostra.
7. `escopoDeEscrita`, `escopoEscrita` e `podeEscreverNoEscopo` são os nomes vigentes nas TRÊS camadas; nenhum nome
   antigo sobrevive em `src/**` (exceto onde o relatório justificar, nominalmente).
8. `Operador.escopoEscrita` e `Permissoes.escopoEscrita` continuam `readonly` e continuam casados estruturalmente.
9. Nenhum corpo de função mudou na Frente C — o diff dela é rename puro, e o relatório prova.
10. `src/lib/unidades/slugs.ts` é a única fonte de `'geral'` e `'todas'` em `src/lib/**`, com allowlist nominal.
11. `src/lib/ajuda/registry.ts` não foi tocado, e os dois módulos têm o comentário do homônimo.
12. `src/lib/ativos/identidade.ts` existe, e `actions/compras.ts` e `actions/ativos.ts` consomem os dois a mesma régua.
13. Compra com patrimônio repetido em OUTRA filial passa; na MESMA filial é recusada com a mensagem de hoje. Teste
    cobre os dois, e nasceu vermelho.
14. As 8 rotas chamam o helper de pertinência; `rotas.test.ts` afirma `>= 8` por varredura, não por lista redigitada.
15. `?filial=<id inexistente>` responde `notFound()` nas rotas de leitura; `?filial=<slug de filial desativada>`
    continua recortando; `?filial=<id de outra filial ativa>` continua abrindo para qualquer cargo.
16. `/itens/conferencia` continua caindo no seletor quando a filial existe e o cargo não escreve nela.
17. `chave-versao-sql.test.ts` existe, lê o SQL do disco e reprova se a chave TS divergir.
18. `docs/INVENTARIO-LEITURAS.md` existe, lista os 116 call-sites (ou o número medido) com arquivo, linha, tabela,
    classificação e justificativa de uma linha, e a soma bate com a varredura.
19. Nenhum arquivo em `supabase/migrations/` foi criado ou tocado; `supabase/migrations.lock.json` intacto.
20. Nenhuma tela mudou visualmente, e nenhum texto de operador mudou, além da recusa do critério 15.
21. Nenhum cargo passou a ver menos do que via.
22. `npm run verificar:actions` e `npm run db:test:mutations` continuam verdes (o segundo não deve nem se mexer —
    a fase não toca SQL; se ele mudar, você mudou algo que não devia).
23. `package.json` em `1.62.0`, `CHANGELOG.md` e `registry.ts` com entrada, tag `v1.62.0` anotada.
24. `docs/DECISOES.md` tem a ata da fase, datada, com as decisões e o motivo de cada uma.
25. `docs/RELATORIO-F57.md` existe, no padrão F45→F56, com o roteiro do Johnny no topo.
26. O PR está mergeado com `verificar` e `banco-sem-docker` verdes — ou aberto, com o bloqueio no topo do relatório.
27. `docs/ARQUITETURA.md` §10 e `docs/README.md` mencionam os módulos novos.
28. Nenhum dado real (nome, patrimônio, e-mail, valor de credencial) em teste, fixture, evidência ou log.

# Verificação — rode de verdade
A cada incremento e entre cada lote da Frente H: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build`
antes de cada push. Leia a falha, corrija a **causa raiz** e repita até passar. **Não afrouxe trava, não acrescente
exceção para ficar verde, não troque asserção por afirmação, não alargue allowlist para caber um caso que devia ser
consertado, e não mude teste existente para acomodar rename sem conferir que o que ele prova continua o mesmo.**
Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

**A TABELA DOS CASOS-LIMITE VEM ANTES DO REFACTOR.** É a mitigação que a ficha exige, e a ordem não é negociável:
escreva `docs/f57-evidencias/casos-limite-antes.md` com a matriz **cargo × vínculos × parâmetro** (os quatro cargos ×
{sem vínculo, um vínculo, dois vínculos} × {sem param, `todas`, id válido, id inexistente, slug de filial desativada,
lixo}), rode-a contra o código ATUAL, veja os três casos documentados passarem, e **só então** mexa em
`filtros/filial.ts`. Depois de cada lote, rode a mesma matriz e cole o antes × depois. Uma linha que mudar sem estar
declarada é regressão, não refinamento.

Provas obrigatórias, cada uma com a saída real em `docs/f57-evidencias/`:
- **Sabotagem A — o tipo nominal**: tente construir `UnidadesEfetivas` por objeto literal, por `as`, e por
  `number[]` → o `tsc` recusa os três, e a saída dele está na evidência. Depois: troque `efetivar` por identidade
  literal (`return selecao as UnidadesEfetivas`) → o teste de EFEITO fica vermelho. É a distinção do
  `pertenceAoEscopo`: comparar e concordar ≠ não comparar.
- **Sabotagem B — o fail-open**: faça uma query receber lista vazia como "tudo" em algum call-site migrado → não
  compila. Essa é a prova de que a fase fez o que prometeu.
- **Sabotagem C — os três casos-limite**: tire o terceiro valor do tipo (o `filial_id is null`) → `/relatorios/gerados`
  perde os consolidados no teste; faça a resolução de slug filtrar por filial ativa → o caso da desativada fica
  vermelho; troque o gate de cargo por `escopoEscrita.length === 0` → o caso do operador sem vínculo fica vermelho.
- **Sabotagem D — a identidade**: o teste da Frente E vermelho contra o código de hoje (capture ANTES do conserto), e
  verde depois; e reintroduza a consulta global → vermelho de novo.
- **Sabotagem E — as rotas**: acrescente uma rota de mentira que leia `sp.filial` sem o helper → `rotas.test.ts`
  vermelho; depois remova-a.
- **Sabotagem F — os slugs**: escreva `'geral'` num módulo de `src/lib/**` fora de `unidades/slugs.ts` → a trava
  acusa; escreva num componente → ela NÃO acusa (o escopo é `src/lib/**`, fato 14).
- **Sabotagem G — a `chaveVersao`**: mude a chave TS para `periodo|filial` → `chave-versao-sql.test.ts` vermelho.
- **A contagem final**: a varredura dos 116 (ou o número medido) antes × depois, e o `INVENTARIO-LEITURAS.md`
  conferido contra ela — a soma tem de bater, e se não bater é o inventário que está errado, não a varredura.
- **`npm run build` limpo**, colado por inteiro, e `npm run test` com o total de testes antes × depois.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação
em nenhuma hipótese. Régua, nesta ordem: (1) uma medição sua contra o disco de hoje; (2) as quatro decisões do Johnny
abaixo, que estendem a ficha; (3) a ficha da F57 no §5 do plano; (4) este prompt, no que ele detalha — e onde ele
diverge da ficha, a divergência está declarada aqui e vai para o relatório; (5) as convenções do repositório
(`CLAUDE.md`, `AGENTS.md`, código existente); (6) a opção mais simples e reversível. Decisão não-óbvia vai para
`docs/DECISOES.md` com data, contexto, escolha e motivo.

**As quatro decisões do Johnny (14/09/2026), que a ficha não tinha:**
i. **`compras.ts` é consertado de verdade** — recorta por filial, alinhando com a `0091`/`0092`. O comportamento muda,
   e a mudança É o conserto. Declare-a no relatório e no CHANGELOG.
ii. **A recusa nas 8 rotas é `notFound()`, e só para filial que NÃO EXISTE** — desativada continua valendo, outra
    filial continua abrindo, `/itens/conferencia` mantém o fallback de escrita.
iii. **Uma run, uma PR**, com lotes internos e `tsc` verde entre eles.
iv. **O rename vale nas três camadas** (`lib/`, `components/`, `app/`).

**As nove decisões que esta fase precisa tomar por escrito:**
1. **A forma de `RecorteDeLeitura`** — como "universal" é representado com nome próprio, e o que `recorteDe` recebe
   (`Permissoes`, `Operador`, ou um recorte estrutural novo, no espírito do fato 7).
2. **A forma de `UnidadesEfetivas`** — ids, slugs ou os dois; como o *brand* é feito; e por que `efetivar` é operação
   e não identidade (o argumento do `pertenceAoEscopo`).
3. **O terceiro valor** — como o tipo representa "linha que não pertence a unidade nenhuma" (o consolidado com
   `filial_id is null`), e por que essa forma e não outra.
4. **O alcance do rename** — se `escreveNaFilial` e `filiaisParaEscrita` entram, e o critério que decidiu.
5. **O conteúdo de `unidades/slugs.ts`** — quais constantes migram, quais ficam, a forma da trava e a allowlist.
6. **A régua de identidade** — a assinatura de `chaveDeIdentidade`, como ela espelha o `coalesce` do índice, e o que
   `actions/ativos.ts` passa a delegar.
7. **O helper de pertinência** — nome, lugar, assinatura, o que ele consulta (lista já carregada × query própria) e
   como `rotas.test.ts` varre o disco sem redigitar lista.
8. **A ordem e o recorte dos lotes da Frente H** — e o que decide a classificação de cada call-site no inventário
   ("precisa de `empresa_id`" × "confia na RLS").
9. **O laço da `chaveVersao` e do nome do índice** — o que fica registrado para a F65, e por que nada disso é
   consertado aqui.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** e registre. Bloqueio real — cota de Actions
esgotada, CI fora do ar, uma dependência do repositório quebrada: contorne se for seguro; senão, **entregue o resto e
registre a pendência com o que falta para resolvê-la**. **Não crie migration, não desative a proteção da `main`, não
force push, não rode nada contra produção, não alargue o escopo para a F58, e não estreite o recorte de leitura de
nenhum cargo.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório — foi
assim que a F46, a F53 e a F55 acertaram o próprio escopo. **Aqui já há cinco divergências medidas de saída**, e elas
vão no relatório: são **116** call-sites, não ~109; `podeEscreverNaFilial` mora em `components/layout/permissoes.ts`,
não em `auth/papeis.ts`; o campo `filiaisEscrita` vive em DOIS tipos casados, não em um; o defeito da identidade é em
`actions/compras.ts`, não em `queries/compras.ts`; e `url-params.ts` já devolve `{modo}`, então desfazer o achatamento
é remover dois `return []`, não reescrever o parser. Declare também as quatro que este prompt cria por decisão do
Johnny.

# Git e segurança
Branch `f57-quatro-significados-de-filial`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional
(`refactor(f57): …`, `feat(f57): …`, `fix(f57): …`, `test(f57): …`, `docs(f57): …`). Commite também esta ordem
(`docs/prompts/F57-quatro-significados-de-filial-ultracode.md`) na branch, num commit de documentação — o primeiro
commit de CÓDIGO é o da Frente A. Um commit por lote na Frente H, com o nome da superfície na mensagem.
PR com `gh pr create`; merge só com `verificar` e `banco-sem-docker` verdes; correção depois do merge vai por PR novo.
Agrupe os pushes — cada um custa CI numa cota apertada. **Nunca:** push forçado, `git reset --hard`,
`git checkout -- .`, `git clean -fd`, amend de commit que não é seu, commitar `.env*` ou `scratchpad/`, criar ou
editar migration, mexer na proteção da `main`, ou escrever em qualquer banco.

# Como trabalhar
Explore com subagentes paralelos, e **cada um volta só com resumo e NÚMEROS MEDIDOS** (nunca com dado real):
(a) **o filtro de filial** — os 116 call-sites com arquivo:linha e tabela, mais quem chama `resolverFiliais*` e
`filtroFilialPadrao`, e a cadeia da página até a query; (b) **o vocabulário de escrita** — as três camadas, os dois
tipos casados, e tudo que `filiaisEscrita` arrasta; (c) **os casos-limite** — onde cada um dos três nasce no código de
hoje, e o teste que já o cobre (ou a falta dele); (d) **as 8 rotas** — como cada uma lê o parâmetro, o que faz com id
inválido hoje, e qual delas já tem validação; (e) **a identidade** — as duas réguas, as migrations `0091`/`0092`, e
todo lugar que consulta patrimônio sem filial; (f) **os catálogos** — que testes e varreduras enumeram nome de função,
módulo ou rota, e o que o rename e os módulos novos exigem de cada um.

Escreva `docs/PLAN-F57.md` antes de implementar, com: as contagens reais; o desenho de `RecorteDeLeitura`,
`UnidadesEfetivas` e `efetivar`, com as assinaturas; a forma do terceiro valor; a matriz de casos-limite; a lista dos
lotes da Frente H na ordem, com o número de arquivos de cada um; o desenho do inventário; as nove decisões já tomadas;
e a ordem de reversão (que aqui é `git revert` + redeploy, por lote de trás para frente — por isso os lotes).
Implemente frente a frente, na ordem A → I, com `lint`/`test`/`tsc` verdes entre uma e outra.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F57.md` e os 28 critérios, com
estas perguntas: sobrou algum caminho de tipo que produza `UnidadesEfetivas` sem `efetivar`? sobrou alguma função em
`src/lib/**` que devolva lista vazia querendo dizer "tudo"? o consolidado com `filial_id is null` ainda aparece em
`/relatorios/gerados`, inclusive com `?filial=geral` e sem param? o slug de filial desativada ainda recorta? o operador
sem vínculo ainda cai em "todas" com o ⚠? algum cargo passou a ver MENOS do que via — em qualquer das 8 rotas, no
export de CSV (`actions/exportar.ts` reparseia a querystring da própria página) ou nos relatórios? a Frente C mudou
algum corpo, e não só nomes? o `readonly` dos dois tipos sobreviveu? `ajuda/registry.ts` foi tocado? a trava de slug
acusa `src/lib/**` e ignora `components/`? compras com patrimônio repetido na MESMA filial ainda é recusada, e a
mensagem é a de hoje? `actions/ativos.ts` e `actions/compras.ts` usam a mesma régua, sem uma segunda definição
sobrando? alguma das 8 rotas ficou sem o helper, ou ganhou `notFound()` onde a filial existe? `/itens/conferencia`
ainda cai no seletor para filial que existe e o cargo não escreve? o `rotas.test.ts` quebraria com uma rota nova? o
`INVENTARIO-LEITURAS.md` bate com a varredura, e alguma classificação está sem justificativa? algum arquivo em
`supabase/migrations/` foi tocado? algum arquivo fora do escopo foi tocado? **Aponte apenas lacunas de correção ou de
requisito declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F57.md`, em pt-BR, no padrão dos relatórios F45→F56, **com o roteiro do Johnny no TOPO** — o que ficou
com ele, passo a passo, e por quê (no mínimo: conferir `/relatorios/gerados` e o filtro de filial em produção depois
do deploy, e a compra com patrimônio repetido, que é a única mudança de comportamento da fase). Depois: o que mudou por
arquivo e por quê; **os números MEDIDOS** lado a lado com a ficha (os 116 × ~109; as referências de cada nome antes ×
depois; arquivos por lote; testes antes × depois), e **cada divergência explicada** — a começar pelas cinco já
conhecidas; as **nove decisões** com o custo que decidiu cada uma; as **sete sabotagens** com saída real; a matriz de
casos-limite antes × depois; os 28 critérios autoverificados; e a seção **"o que este relatório NÃO prova"** — no
mínimo: que o tipo nominal impede o fail-open FUTURO, não prova que nenhum call-site de hoje já estava errado (o
inventário é a lista de suspeitos, não o veredito); que a recusa de filial inexistente foi provada em teste e no
ensaio, não contra um link antigo real de alguém; que a mudança em compras foi provada por teste, e o primeiro lote
real de compra com patrimônio repetido entre filiais é a prova que falta; e que o inventário classifica por LEITURA do
código, e a F63 pode discordar de linhas dele. Pendências e **backlog nomeado**: para a **F58** (as assinaturas que
você acabou de mudar são a entrada dela; diga quais); para a **F65** (a `chaveVersao` com `empresa_id` e o índice
recriado — e que `versao-snapshot.ts:43` casa pelo NOME do índice, que a F65 quebra); para a **F70/F72** (o corpo de
`recorteDe` e de `efetivar` é o que muda lá — diga em quantas linhas); e o que o inventário classificou como "precisa
de `empresa_id` explícito", com a contagem por fase de destino. **Evidências, não afirmações:** saída real e completa
dos comandos. Termine a resposta final com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório e comentários de código em **pt-BR**. Identificadores de domínio em português sem
acento (`recorteDe`, `unidadesMarcadasPorPadrao`, `escopoDeEscrita`, `chaveDeIdentidade`); utilitários e infra em
inglês. Commits em pt-BR no padrão conventional. As mudanças do `registry.ts` em LINGUAGEM DE OPERADOR — há teste que
recusa termos de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~10 minutos)

Esta fase **não toca banco**: sem migration, sem MCP da Supabase, sem ensaio, sem produção. O pré-voo é curto por isso.
Salve este arquivo em `docs/prompts/F57-quatro-significados-de-filial-ultracode.md`, **sem commit** — o agente o
commita na branch da fase. O prompt cita os 20 fatos do cabeçalho pelo número, então ele precisa estar lá quando você
colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. Confirme onde a F56 parou: 1.61.0 no package.json, última migration 0140.
type package.json | findstr version
dir supabase\migrations | findstr 014

# 3. A F56 fechou de verdade? (PR mergeado, tag v1.61.0, árvore limpa)
git log --oneline -5
git tag --list "v1.6*"
git status --short

# 4. gh autenticado e versão do Claude Code (o modo auto exige 2.1.83+).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

**Duas coisas que só você confere antes de colar:**

1. **A cota de Actions** — em github.com/settings/billing. Esta fase tem vários lotes e portanto vários pushes; se a
   cota acabar no meio, o PR não mergeia e a fase termina com ele aberto.
2. **A F56 não deixou ponta aberta.** Leia o topo de `docs/RELATORIO-F56.md`: se ficou algum apply pendente (a `0139`
   ou a `0140` em produção), **resolva antes** — a F57 mexe em `actions/compras.ts` e em `queries/gerados.ts`, e
   partir de um `main` que não está no ar contamina a leitura do que quebrou.

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` e o `gh` não estão negados — a
fase abre PR, mergeia e publica tag) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).

**MCP:** só o **Context7** ajuda aqui (doc do TypeScript sobre *branded types* e do Next 16 sobre `notFound()` em
Server Components). O da Supabase **não é necessário** — e é bom que não seja: é a primeira fase do Bloco D sem um
único caminho de banco.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f57
# cole o bloco do prompt inteiro e deixe rodando
```

**Esta é a fase mais desatendida de todo o bloco de preparação.** Sem migration, sem apply, sem persona no ensaio,
sem import — nada que o classificador do modo `auto` costume barrar. É uma fase longa de compilador, e o compilador
não pede permissão. Pode colar e sair de perto.

Se preferir de madrugada, headless (o prompt vai por stdin, porque o bloco passa do limite de linha de comando do
Windows):

```powershell
# salve só o bloco do prompt em prompt-f57.txt (fora do repositório)
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f57.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f57.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Modo `auto` continua sendo o certo: a fase roda `npm ci`, `gh pr create`, `gh pr merge`, tag e push — nada disso passa
numa allowlist estreita.

**`--worktree` é viável nesta fase** (ao contrário da F56): não há `.env.local`, banco nem Playwright no caminho. Se
quiser mexer no repositório enquanto ela roda, use
`claude --worktree f57 --model opus --permission-mode auto`; lembre de `git worktree remove` depois.

Recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; src/lib/auth/recorte-leitura.ts, src/lib/unidades/slugs.ts e src/lib/ativos/identidade.ts existem; nenhuma funcao exportada de src/lib devolve lista vazia significando todas; docs/INVENTARIO-LEITURAS.md existe com a contagem batendo com a varredura; nenhum arquivo em supabase/migrations foi criado ou tocado; package.json em 1.62.0 com tag v1.62.0; o PR esta mergeado com verificar e banco-sem-docker verdes ou aberto com o bloqueio no topo do RELATORIO-F57.md; e docs/RELATORIO-F57.md tem o roteiro do Johnny no topo
```

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Quatro momentos para acompanhar:

1. **A matriz de casos-limite, ANTES do refactor.** `docs/f57-evidencias/casos-limite-antes.md` tem de existir e estar
   rodado contra o código ATUAL antes do primeiro commit que mexe em `filtros/filial.ts`. Se o agente refatorar
   primeiro e medir depois, a mitigação que a ficha exige virou decoração — e é aí que a regressão silenciosa entra.
2. **A Frente C.** O diff dela tem de ser **rename puro**. Um corpo de função alterado no meio de 76 renames é o tipo
   de coisa que passa despercebida na revisão e aparece três fases depois.
3. **A sabotagem A.** A saída do `tsc` recusando as três formas de construir `UnidadesEfetivas` é a prova central da
   fase. Sem ela, você tem um `type alias` com nome bonito, não uma trava.
4. **Os lotes da Frente H.** Um commit por superfície, `tsc` verde entre eles. Se vier um commit único com 116
   call-sites, a reversão por lote — que é o plano B declarado — deixou de existir.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.**
2. Leia as **nove atas** em `docs/DECISOES.md`. A **1**, a **2** e a **3** (as formas de `RecorteDeLeitura`,
   `UnidadesEfetivas` e do terceiro valor) são as que a F58, a F70 e a F72 herdam inteiras — se alguma parecer errada,
   é agora que custa barato.
3. `git diff main...f57-quatro-significados-de-filial -- supabase/` deve vir **vazio**. Qualquer coisa aí é a fase
   quebrando o próprio escopo.
4. Abra `docs/INVENTARIO-LEITURAS.md` e leia umas dez linhas ao acaso conferindo contra o código: ele é o orçamento das
   F63–F67, e um inventário errado custa caro exatamente nas fases mais caras.
5. Em produção, depois do deploy, confira com os próprios olhos: `/relatorios/gerados` ainda mostra os consolidados;
   `/ativos?filial=todas` ainda abre tudo; `/ativos?filial=99999` (id que não existe) agora dá 404; e o filtro de
   filial de `/itens` e `/movimentacoes` ainda entra marcado do jeito de sempre para um operador.
6. **A única mudança de comportamento** é a compra: patrimônio que já existe em OUTRA filial deixa de bloquear. Se
   você quiser vê-la, faça no **ensaio** (`npm run dev` com o `.env.local` de hoje), nunca em produção.
7. Rode você mesmo `npm run test` e `npm run build` uma vez.
8. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o aprendizado e rode
   em sessão limpa. A reversão aqui é simples porque não há banco: `git revert` dos commits de lote, de trás para
   frente, + redeploy.

---

## Suposições que fiz

1. **A F57 vem agora e a F56 está fechada**: `package.json` em `1.61.0`, última migration `0140`, tag `v1.61.0`
   publicada, árvore limpa. Por isso a versão da fase é **`1.62.0`** — e o prompt manda medir antes, não confiar no
   número escrito.
2. **A F57 não cria migration nenhuma.** A ficha não pede, as entregas dela são todas `.ts` e `.md`, e o "Não entra"
   exclui `empresa_id`. Se durante a run aparecer defeito de banco, ele vai nomeado para o backlog — não vira uma
   `0141` de oportunidade.
3. **O `?filial=todas` continua valendo.** A sentinela some do vocabulário interno (vira `{ modo: 'todas' }`), mas a
   URL não muda: link antigo que alguém salvou continua abrindo igual. Mudar isso seria mudança de rota, que está no
   escopo negativo.
4. **O recorte de leitura nasce universal e assim fica.** Nada nesta fase estreita o que um cargo vê — a ADR-002 dá o
   app inteiro em modo leitura a todo logado ativo, e trocar isso é F70/F72, não F57.
5. **Os nomes da ficha valem como estão**, exceto onde a medição os contradiz: `podeEscreverNaFilial` está em
   `components/layout/permissoes.ts` (fato 6) e o defeito de identidade está em `actions/compras.ts` (fato 15). Se
   você preferir outros nomes para `escopoDeEscrita`/`escopoEscrita`, é uma linha no prompt — mas eles vêm da ficha e
   a F58 já os cita.
6. **O inventário classifica por leitura do código, não por execução.** Ele lista os 116 call-sites e diz, para cada
   um, se a virada vai precisar de `empresa_id` explícito ou se a RLS resolve. É um julgamento fundamentado, e a F63
   pode discordar de linhas dele — o valor está em existir a lista completa, não em ela ser infalível.
