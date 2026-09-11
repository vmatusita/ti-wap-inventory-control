# F56 — O import sem WAP-ismo e sem bomba

*Ordem de serviço gerada em 11/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco C — com as quatro
decisões do Johnny da mesma data.*

**Por que ela existe.** O import de startup é a operação mais destrutiva da casa — apaga o acervo inteiro de
uma filial e o recria a partir de um arquivo — e hoje ele conhece a WAP pelo nome. As cinco filiais são um tipo
literal no TypeScript (`FilialOficial`), os dezoito apelidos da coluna Site moram numa constante, e a filial
escolhida na tela só é reconhecida se o slug dela for um dos cinco que o código conhece. A consequência já está
no ar: **produção tem uma sexta filial** — `filialteste`, "Filial de Teste" — e o import dela é impossível. Cada
linha do arquivo vira `site_divergente`, com uma mensagem que culpa o ARQUIVO pelo que é um buraco do CÓDIGO. A
ficha resume numa frase: *tirar o vocabulário da WAP do tipo e do código, e consertar os defeitos do motor que
hoje transformam erro de cadastro em arquivo recusado sem diagnóstico.*

E o motor tem bombas. Um CSV com um `;` a mais numa célula importa valores nas colunas erradas com o preview
**verde** — e o passo seguinte apaga o acervo e o recria a partir disso. O CSV não tem teto de linha nem de
coluna. Os tetos que existem foram calculados contra um corpo de 8 MB que **não vale em produção**: na Vercel, o
limite de corpo de uma função é 4,5 MB, no pedido e na resposta — e o arquivo de 5 MB que a tela aceita já passa
dele. E há uma bomba que a ficha não conhecia, achada pela F54 e medida hoje em produção: **o "Substituir tudo"
estoura por chave estrangeira em quatro das seis filiais** — Matriz, Linhares, Eusébio e Filial de Teste têm
lançamentos e pendências de item presos ao acervo, e a RPC não sabe tirá-los do caminho. A tentativa aborta com
`23503`, deixa o backup no bucket como órfão e, desde a F55, acende o alarme no dia seguinte.

**Por que ela vem AGORA.** Porque as fases de que ela depende fecharam: a F51 decompôs a RPC de import (a função
que apaga acervo é UMA, com nome), a F52 pôs as guardas de escopo dentro dela, e a F55 deixou o funil de falha e a
sonda no ar — a fase que mexe no motor mais perigoso da casa encontra rede. Porque a F54 e a F55 deixaram escrito,
no backlog **desta** fase, a bomba de FK. E porque o multiempresa depende dela: o onboarding do piloto (F73) é
*"criar a empresa, criar as filiais, **subir os apelidos do De→Para (F56)**, rodar o import"*.

**O que esta fase NÃO é.** Não é onboarding (criar empresa, filial, colaborador ou item pelo import — é virada).
Não é `empresa_id`. Não generaliza `scripts/import/` — a ferramenta do go-live F4, com cópias próprias do
vocabulário, morre com ele — nem transplanta o fallback por substring de `scripts/import/normalizar.ts:522-527`.
Não conserta as outras quatro RPCs destrutivas que têm a mesma forma do defeito de FK (reset de acervo, mesa de
conflitos, apagar ativo, apagar movimentação): decisão do Johnny, backlog nomeado. Não cria tela para editar o
vocabulário de Tipo e Situação — o dado vai para o banco; a edição dele é onboarding. Não decompõe os componentes
gigantes do import (`importar-wizard.tsx` 1.064 linhas, `grupos-erros.tsx` 1.176). Não muda os três layouts do
CSV, nem o transporte do plano. Não reescreve a ajuda para o multiempresa (§10 do plano, em aberto). E **não roda
import em produção** — nunca, nem para provar.

**As quatro decisões do Johnny para esta fase (11/09/2026).** (i) **A F56 conserta a bomba de FK do import**: a RPC
passa a desvincular os lançamentos de item do acervo substituído — o saldo de itens não muda — e a apagar as
pendências de item dele, com backup e restauração cobrindo tudo; as outras quatro RPCs destrutivas ficam no
backlog. (ii) **Tipo e Situação também viram dado no banco**, não só as unidades: uma tabela de vocabulário do
import com o seed exato de hoje, o motor recebendo tudo por parâmetro, e **nenhuma palavra da WAP no código do
import**. (iii) **A tela Administração › Filiais ganha ver e editar apelidos**, com trilha na Auditoria — e o nome
da própria filial vale sempre na coluna Site, sem cadastro. (iv) **A `0140` — que recria a função que apaga acervo
— é aplicada pelo agente, em ensaio e em produção**, como na v1.59.1; se o classificador barrar, ela fica com o
Johnny, com o handoff pronto.

---

**Quarenta e três fatos de leitura do repositório, de produção e do ensaio, medidos em 11/09/2026, que a ficha do
plano não tem.** Estão agrupados pelas frentes. **Refaça cada medição antes de usá-la** — a fila desta casa anda
rápido, e um número desta lista pode ter envelhecido entre hoje e a sua run. (Os grupos levam a letra da frente do
prompt a que servem; a ordem dos fatos não é a ordem de execução.) Esta lista passou por duas revisões
adversariais em contexto fresco antes de ser entregue; os fatos 10, 22, 27, 29, 31 e 33 são os que elas mais mudaram.

## Estado de partida

1. **As migrations desta fase são a `0139` e a `0140`, e a versão é a `1.61.0`.** A ficha promete a `0136`; a F54
   consumiu a `0136` e a `0137`, a F55 a `0138`. Há **137 arquivos** em `supabase/migrations/` (a `0029` é gap
   real), o último é `0138_resumo_integridade_e_rotulo.sql`; `package.json` em **`1.60.0`**, tag `v1.60.0`,
   `main` em `ef8a1e4`, árvore limpa. São duas migrations, e não uma, pelo fato 31.

2. **O ensaio voltou — mas o alarme dele continua aberto.** Ele parou de responder às 19:29 UTC de 10/09, no meio
   da última prova da F55. Hoje, às 08:26 de Brasília, respondeu `select 1`, tem 1.602 ativos e as cinco filiais
   ativas — `serra` (id 4) com `ativo = true`: o plantio da F55 não ficou —, e o ledger termina em
   `20260910134309`. A **issue #41** (`[alarme] ensaio · integridade`) segue **ABERTA**; os dois disparos agendados
   depois dela (23:10 UTC de 10/09 e 08:03 UTC de 11/09) foram verdes. Fechá-la é o item 0 do roteiro do Johnny na
   F55 e está no pré-voo desta ordem — esta fase escreve no ensaio (fato 39), e o estado de partida dele tem de
   ser conhecido.

3. **Produção tem SEIS filiais, não cinco.** 1 `matriz` "Matriz" · 2 `cd-afonso-pena` "CD Afonso Pena" · 3
   `linhares` "Linhares" · 4 `serra` "Serra" · 5 `eusebio` "Eusébio" · **6 `filialteste` "Filial de Teste"** (5
   ativos). O ensaio tem as cinco primeiras. A "sexta filial" da ficha não é hipótese: `filialPorSlug('filialteste')`
   e `mapearUnidade('Filial de Teste')` devolvem `null`, e o import dela recusa 100% das linhas. E o "nome canônico"
   do código **já diverge do cadastro**: `FilialOficial` diz `'CD-Afonso Pena'`, o banco diz `CD Afonso Pena` — a
   mensagem de `site_divergente` mistura os dois. Por isso esta ordem troca o *"`FilialOficial` vira `string` (o
   nome canônico da unidade)"* da ficha pela identidade por **`filial_id`** — divergência declarada.

4. **O import é raro, e a maior filial é conhecida.** 12 imports em produção, o último em 31/07/2026. A Matriz tem
   **1.142** ativos hoje (1.217 no go-live — comentário em `queries/import-logs.ts:59`). Todo teto que esta fase
   derivar tem de ficar acima disso, com a folga escrita.

## Frente A — a correção imediata

5. **As linhas da ficha continuam certas.** `src/lib/import/tipos.ts:71-76` (a união literal dos cinco nomes);
   `plano.ts:342` (`filialPorSlug(filial.slug) ?? mapearUnidade(filial.nome)`); `plano.ts:112-122` (com
   `filialAlvo === null`, o bloqueante `site_divergente` nasce em **toda** linha). E o defeito já estava descrito no
   próprio código desde a F7B: `correcoes.ts:463-470` explica que, com a filial selecionada fora do De→Para, o card
   de Site vira `kind: 'nenhuma'` — informativo, sem ação —, e termina com *"O conserto é cadastrar a unidade no
   De→Para"*. É esse cadastro que esta fase cria. ⚠ Depois da Frente D, toda filial ativa tem pelo menos o próprio
   nome no vocabulário: o `filial_fora_do_vocabulario` do primeiro commit passa a disparar só quando o `filial_id`
   escolhido não está no vocabulário (filial inativa, seleção velha). O teste do primeiro commit muda por desenho.

## Frente D — o vocabulário vira dado

6. **Quem consome o vocabulário, e onde roda.** No SERVIDOR: `plano.ts` (`mapearUnidade` ×2, `mapearCategoria`,
   `estadoPlanilha`, a mensagem de `:154` com as cinco categorias por extenso) e `correcoes.ts` (`mapearUnidade`
   ×5 — `:122`, `:130-131`, `:276`, `:463`, `:471` —, `CATEGORIAS_TERMOS` e `ESTADOS_CORRIGIVEIS` nos candidatos do
   Levenshtein, `:480`, `:487`). ⚠ Apesar do comentário de "folha client-safe", **`correcoes.ts` não roda no
   navegador**: só `plano.ts` e o barril `index.ts` o importam, e os componentes pegam do barril apenas TIPOS. No
   CLIENTE, os consumidores são outros três: `grupos-erros.tsx:20` (`TIPO_CANONICO` e `SITUACAO_CANONICA` nos
   Selects, `:65-66`; `extrairPatrimonioDoHostname` — ou seja, os PREFIXOS — em `:519`), `ops-grupo.ts:15`
   (`TIPO_CANONICO`/`SITUACAO_CANONICA`, `:118-136`, `:217-219`) e `importar-wizard.tsx:39,153`
   (`extrairPatrimonioDoHostname`). Logo o vocabulário tem duas cópias com papéis diferentes: a que o servidor lê do
   banco — a única que JULGA — e a que desce por prop para esses três (regra da F39 no `CLAUDE.md`: *"o mapa desce
   por prop a partir de um Server Component (nunca import de query em módulo cliente)"*). O formato tem de ser
   serializável como prop de Client Component — confira na doc do React 19/Next 16 o que passa (instância de
   classe, `RegExp` e função não passam).

7. **O inventário do que vira dado** (`deparas.ts`): `UNIDADES` — **18 chaves → 5 filiais** (`:181-200`); ⚠ **cinco
   delas são o próprio nome da filial, normalizado** (`matriz`, `cd afonso pena`, `linhares`, `serra`, `eusebio` —
   confira contra `0007`/`0026`): com o nome próprio valendo sempre (decisão iii), o seed de `unidades_apelidos` são
   **13 apelidos**, e os 18 históricos são 13 + 5. `SLUG_POR_FILIAL` + `filialPorSlug` (`:207-222`) — um
   consumidor só (`plano.ts:342`), e somem. `CATEGORIAS` — 5 termos (`:228-234`); `ESTADOS` — **17 termos**, com
   `'rt wap'` e `'posse wap'` → `defasado` (`:261-279`). Os reversos `TIPO_CANONICO` (5) e `SITUACAO_CANONICA` (7)
   **não são termos normalizados: são a FORMA DE EXIBIÇÃO** — "Notebook", "Saída", "Empréstimo", "Manutenção"… —,
   o texto que o Select mostra, que o "Definir como" grava na célula, e que vai para `import_logs.correcoes` e para o
   CSV corrigido (`deparas.ts:250-256`, `:316-328`; `deparas.test.ts:135`). O vocabulário no banco precisa guardar
   essas **12 formas** à parte dos termos. E **`PREFIXOS_PATRIMONIO` — 7 prefixos** (`:152`), que o próprio
   comentário chama de *"Prefixos OFICIAIS de patrimônio da WAP"*: pela decisão (ii), também vocabulário.

8. **`scripts/import/` tem cópias próprias** de tudo isso (`normalizar.ts:208` `UNIDADES`, `:234`
   `SLUG_POR_FILIAL`, `:91` `PREFIXOS_CONHECIDOS`; `tipos.ts:40` `FilialOficial`). É a carga do go-live (F4), que a
   ficha manda não generalizar. A trava `sem-wapismo` varre `src/**`, não `scripts/`.

9. **O molde de "vocabulário que o banco guarda e o teste protege" já existe**: `src/lib/validators/tipos-item-sql.test.ts`
   (F39) — *"os literais esperados vivem AQUI, no próprio teste, e não num módulo que alguém possa 'arrumar' junto
   com o seed"*, derivando o vocabulário **direto do SQL da migration vigente**. Os 13 apelidos (+ 5 nomes), as 5
   categorias, os 17 estados, as 12 formas de exibição e os 7 prefixos passam a ser a fixture desse teste; o seed da
   `0139` é o outro lado.

10. **A normalização, e por que `unaccent` está fora.** `normalizarTexto` (`deparas.ts:25-39`): NFD, remove a faixa
    U+0300–U+036F inteira, minúsculas, tira `:` final, colapsa espaços, apara. A casa **proíbe `unaccent`** por ser
    extensão (`0112_colaboradores.sql:31`, repetido na `0125:34`), e já tem o molde de chave normalizada em SQL sem
    extensão: `colaborador_chave` (`0112:89-99`) e `item_chave` (`0125:106-114`) — `IMMUTABLE`, `translate` +
    `regexp_replace` —, cada uma com a guarda TS↔SQL (`src/lib/colaboradores/chave-sql.test.ts`,
    `src/lib/itens/chave-sql.test.ts`). ⚠ Mas a tabela de `translate` desse molde **não é** `normalizarTexto` (que
    decompõe e tira a faixa inteira, e o `:` final). E a unicidade TEM de morar no SQL: `filiais.nome` também é
    escrito fora da action (PostgREST, com a RLS de admin), então só o banco vê todos os caminhos. A chave normalizada
    em SQL espelha `normalizarTexto` exatamente, com guarda TS↔SQL no molde das duas acima. A forma é a Decisão 1.

11. **O seed referencia filial por SLUG.** Os ids coincidem hoje entre produção, ensaio e CI (a `0007` e a `0026`
    criam as cinco nos três), mas o slug é o que foi feito para ser estável, e o CI tem as cinco pelas migrations. A
    `filialteste` só existe em produção e não precisa de apelido: o nome próprio vale sempre.

12. **Verbo novo na trilha tem regra.** `eventos_admin.acao` é TEXT de propósito; o vocabulário fechado mora em
    `src/lib/auditoria.ts` (`ACOES_ADMIN`/`ACAO_ROTULO`) **e** no `comment on column public.eventos_admin.acao`, e
    `src/lib/validators/dev-destrutivo.test.ts` exige que os dois listem os mesmos verbos (o cabeçalho da `0137`
    conta por que existe uma migration só para um comentário). Os verbos da tela de apelidos entram no comentário
    **na migration desta fase**.

13. **Tabela nova passa pelos catálogos da F48 no mesmo commit — e pelo gate de deriva.** Confira quais roteiros
    enumeram tabela, policy ou função por nome (`catalogo_policies.sql`, `seguranca_catalogo.sql`, `papeis_rls.sql`,
    `catalogo_secdef.sql`, `definer_sem_tenant.sql`, `isolamento_tenant.sql`) e acolha as novas por nome. O padrão de
    RLS da casa para vocabulário administrado é o de `tipos_item` (`0114`): leitura pelo piso
    (`papel_atual() is not null`), escrita `e_admin()`. ⚠ O `db:types:diff` do CI (*"o `database.ts` conhece tudo o
    que o banco tem"*) reprova **todo push** em que a `0139` exista e o `database.ts` não conheça as tabelas dela:
    hand-fix datado **antes do primeiro push** com a migration (ela só vai a banco real depois do CI — "O apply"), e
    regeneração de produção no fim, que apaga o hand-fix.

## Frente E — a tela de Filiais

14. **`/admin/filiais` hoje**: `page.tsx` (70 linhas) lista nome, slug, ativos e status, com o `FilialDialog`
    (`components/admin/filial-dialog.tsx`, 189 linhas: nome, slug derivado do nome, ativa, cidade). Escrita por
    `criarFilial` e `atualizarFilial` (`actions/admin.ts:574` em diante, client de sessão + RLS), validação em
    `filialSchema`/`atualizarFilialSchema` (`validators/admin.ts:288-310`, com os slugs reservados da F25). ⚠
    **`atualizarFilial` troca nome E slug**, e **`filiais.nome` não é único** (`0003_tabelas.sql:9-15`) — `criarFilial`
    não confere nada: criar "Serra Park" (apelido da Serra) ou uma segunda "Matriz" já tornaria o vocabulário
    ambíguo. Os apelidos penduram no `filial_id`; a ambiguidade tem de ser barrada na criação, no rename e no
    cadastro de apelido.

15. **O piso de teste de componente é o grau 1 da F45**: `renderToStaticMarkup`, sem interação, sem dependência
    nova; os três `.test.tsx` de `components/layout/` são o molde.

## Frente B — tipos, enums e a regex

16. **Os enums redeclarados.** `import/tipos.ts:44-52` declara `StatusAtivo` com 8 valores (o enum do banco tem 9 —
    `devolvido_fornecedor`, desde a F14); `:64-69` declara `CategoriaAtivo` com 5 (o banco tem 6, com `outro`). ⚠
    **`outro` saiu da união local em 30/08/2026** (dívida I — o comentário de `:54-63` conta): os três
    `Exclude<…, 'outro'>` que a ficha menciona não existem mais; o `Exclude` volta, UM, quando a união passar a vir de
    `Enums<'categoria_ativo'>`. O no-op da ficha continua lá: `deparas.ts:316-317`,
    `Exclude<StatusAtivo, 'descartado' | 'devolvido_fornecedor'>` — o segundo membro nunca esteve na união local.
    `dominio.ts:7-9` já usa `Enums<…>`, e `database.ts` exporta também `Constants` com os arrays dos enums — a fonte de
    runtime para `enums-sql.test.ts`.

17. **O `Exclude` do TypeScript não reclama de valor fora da união.** `Exclude<T, U>` com `U` fora de `T` devolve `T`
    calado — é exatamente como o no-op nasceu. A trava da ficha (*"um caso que falhe em `Exclude<…>` com valor fora
    da união"*) precisa de um utilitário com restrição (`U extends T`) e de um `@ts-expect-error` — e da prova de que
    esse teste de TIPO roda num caminho que reprova: o Vitest daqui não faz checagem de tipo; o job `verificar` roda
    `npm run build`, que checa tipos pelo `tsconfig` (que inclui `**/*.ts`). Prove com sabotagem.

18. **A regex de patrimônio em TS: quatro cópias em dois arquivos.** `patrimonio.ts:5` (`PATRIMONIO_CANONICAL_RE`),
    `:13` (`canonicalizarPatrimonio`, `\d+`), `:142-143` (a faixa, `(\d{7})` duas vezes) e `deparas.ts:166`
    (`PATRIMONIO_EMBUTIDO_RE`, `\d{1,7}` com lookahead — a divergência deliberada). ⚠ **`PARTES_RE` não existe no
    repositório**: a ficha manda derivar de uma constante que nunca foi criada. "Derivar de `PARTES_RE`" significa
    criar as partes compartilhadas.

19. **A regex no SQL está morta.** 20 linhas em 14 migrations citam `{2,4}`, mas só as da `0032`→`0036` executam (10
    linhas, 5 migrations) — e as cinco foram superadas: desde a `0037` (F7J, patrimônio forçado) a RPC não valida mais
    o formato, e `0040`/`0048`/`0064`/`0080`/`0094`/`0131`/`0132` carregam só o comentário *"Antes exigia…"*. **O SQL
    VIGENTE tem zero regex de patrimônio executável.** Então `patrimonio-sql.test.ts` não pode ser "TS = SQL das
    migrations" (migration não se edita): ele é sobre o CORPO VIGENTE (`scripts/db/corpo-vigente.mjs`, F46/F47). A
    forma exata é da Decisão 5.

20. **Os prefixos: mesmos 7 valores, zero trava.** `PREFIXOS_PATRIMONIO` (`deparas.ts:152`) ×
    `PREFIXOS_CONHECIDOS` (`scripts/import/normalizar.ts:91`). Com os prefixos virando dado (fato 7), a paridade
    passa a ser seed × script.

## Frente C — os tetos e o arquivo desalinhado

21. **`src/lib/import/limites.ts` JÁ existe** (30/08/2026, dívida T): `TAMANHO_MAX_ARQUIVO` 5 MB,
    `MAX_LINHAS_PLANILHA` 20.000, `MAX_COLUNAS_PLANILHA` 40, `ErroArquivoImport` e as mensagens. O leitor `.xlsx`
    RECUSA em vez de truncar — mas só depois de carregar o arquivo INTEIRO (`xlsx.ts:106-121`). O CSV
    (`parse.ts:50-68`) não tem teto de linha nem de coluna.

22. **⚠ O teto de corpo que vale em produção é 4,5 MB, não 8 MB — e nos dois sentidos.** A doc da Vercel (*Vercel
    Functions Limits*, atualizada em 24/08/2026, conferida hoje): *"The maximum payload size for the request body or
    the response body of a Vercel Function is 4.5 MB"* — acima disso, `413 FUNCTION_PAYLOAD_TOO_LARGE`, **antes** do
    Next. O `bodySizeLimit: '8mb'` do `next.config.ts:17-21` só manda no `next dev` e em hospedagem própria; o
    comentário de `limites.ts:9-18` (*"fica ABAIXO do bodySizeLimit de 8 MB"*) está errado para produção. E o
    `TAMANHO_MAX_ARQUIVO` de 5 MB **já passa do limite**: um arquivo entre ~4,5 e 5 MB passa na checagem da tela e
    toma 413 no preview. São **cinco corpos** a caber: (1) o pedido de `validarImport` — arquivo + correções no
    mesmo FormData (`importar-wizard.tsx:322-334`); (2) a RESPOSTA de `validarImport` — a `ValidacaoImport` inteira,
    com o plano, o contexto, os grupos e os candidatos; (3) o pedido de `aplicarImport` — plano + correções + custo +
    confirmação; (4) o pedido de `baixarCsvCorrigido` — arquivo + correções; (5) a RESPOSTA dele — o CSV corrigido.
    Os números: o plano, ~580 B por ativo (medição da F7F, comentário do `next.config.ts`) → 20.000 ativos ≈ 11 a 12
    MB; as correções, no pior tipo (`substituir_estado`: dois campos crus de até 500 caracteres + `para` de até 200,
    `validators/importar.ts:28-34`, `:91-95`) × `MAX_CORRECOES` 20.000 ≈ **24 MB**. E o `.max()` do Zod conta
    CARACTERES, enquanto o corpo é medido em BYTES — até 3 por caractere em UTF-8, 6 para caractere de controle
    escapado no JSON.

23. **`planoImportSchema` mora em `actions/importar.ts:133-138`**, não em `validators/importar.ts`, e não tem um
    `.max()` sequer: nem no array (só `.min(1)`), nem nos 18 campos de texto de `ativoPlanoSchema` (`:106-131`). E
    a RPC tem teto próprio: patrimônio de até **60** caracteres, inclusive o forçado, que o motor aceita cru
    (`0132:358-366`) — um `.max()` maior no plano faz o preview aceitar o que a RPC recusa.

24. **⚠ O 413 NÃO deixa backup no bucket — e ninguém o vê.** O backup sobe DENTRO de `aplicarImport` (`:473-515`),
    depois do `aplicarSchema.safeParse` (divergência com a ficha e com o backlog da F55, que supunham o contrário).
    Um 413 da plataforma nunca chega à função: não há log, nem `import_logs`, nem `eventos_admin`, e o `onRequestError`
    da F55 **não pode** vê-lo — ele não entra no Next. E o `next dev` local, onde rodam o smoke e as medições, não
    reproduz o limite da Vercel: a prova do teto é a conta, com o limite lido da doc.

25. **O `.xlsx` é um zip.** `lerXlsx` faz `wb.xlsx.load` do arquivo inteiro e só depois lê `rowCount`
    (`xlsx.ts:106-121`): um `.xlsx` muito compressível expande na memória da função antes de qualquer teto valer.
    Não medido. É a Decisão 7 — medir com um `.xlsx` fictício gerado para isso, **num processo filho com teto de
    heap (`--max-old-space-size`) e timeout**, nunca no processo da sessão, e sem commitar o arquivo.

26. **O desalinhamento.** `parse.ts:56` descarta os erros `FieldMismatch` do PapaParse; `campo()` lê a célula pelo
    índice do cabeçalho — uma linha com um `;` a mais desloca todas as colunas seguintes, e o preview sai verde. ⚠
    Três armadilhas da régua: (a) não compare com o `header.length` cru — `detectarLayout` tolera colunas vazias à
    direita do cabeçalho (`parse.ts:103-107`); a régua é a largura ÚTIL (a última coluna com nome); (b) com
    `skipEmptyLines: false` (`:53`), linha em branco e o `\n` final viram `['']` — a régua roda depois do descarte de
    linha vazia (`:179`, `:198`); (c) o `.xlsx` tem o defeito espelhado: `lerLinha` lê só até o `cellCount` do
    cabeçalho (`xlsx.ts:115`, `:123-128`) — um valor à direita da última coluna nomeada some em silêncio.

## Frente F — a bomba de FK (decisões i e iv)

27. **As chaves estrangeiras são CINCO caminhos, não dois** (lidas de `pg_constraint` em produção, 11/09; nenhuma
    com `CASCADE`): `pendencias_item.ativo_id → ativos` — NO ACTION, imediata, NOT NULL; `pendencias_item.movimentacao_id
    → movimentacoes` — NO ACTION, `DEFERRABLE INITIALLY DEFERRED`, NOT NULL; `lancamentos_item.movimentacao_id →
    movimentacoes` — NO ACTION, imediata, anulável (`0116:76`); **`lancamentos_item.pendencia_item_id →
    pendencias_item`** — NO ACTION, imediata, anulável (`0119:94-95`: o lançamento que RESOLVEU uma pendência;
    gravado por `resolver_pendencias_item_com_lancamentos`, `0122` e `0126`) — apagar a pendência sem desfazer esse
    elo estoura `23503` em outra chave; e **`ativos.substitui_ativo_id → ativos`** — NO ACTION: um substituto que foi
    para outra filial e aponta para um ativo do acervo que sai. O reset e a mesa de conflitos já anulam esse ponteiro
    (`0089:202-204`, `0132:865-866`); o import não. Quem GUARDA o ponteiro antes de anular é o backup do reset, em
    TypeScript — o bloco `ponteiros_perdidos` de `queries/dev-destrutivo.ts:517-546`, o molde da leitura prévia que
    `exportarAcervoFilial` vai precisar; a mesa de conflitos só conta (`ponteiros_anulados`) e declara a lacuna no
    `nao_incluido` (`actions/conflitos.ts:241-249`). (As quatro RPCs do backlog
    também apagam pendências — `0082`, `0089`, `0132:847` — e têm o mesmo defeito latente no elo da pendência.)

28. **O que a função que apaga acervo apaga.** `import_apagar_acervo_filial` (`0131:313-334` — o corpo vigente; a
    `0132` só a chama, em `:527`): `movimentacoes`, `anotacoes`, `termos_gerados` só-desta-filial e `ativos`. Nenhum
    dos cinco caminhos do fato 27.

29. **Produção hoje, pelo critério da RPC** (a filial ATUAL do ativo): Matriz — **16** pendências de item e **18**
    lançamentos presos a movimentação do acervo; Linhares — **16** lançamentos; Eusébio — **1** pendência; Filial de
    Teste — **12** lançamentos; CD Afonso Pena e Serra — zero. Lançamento preso a pendência do acervo e substituto em
    outra filial apontando para ele: **zero** nas seis, hoje. No ensaio: Matriz 20 pendências e 5 lançamentos, CD 1
    pendência, Eusébio 2 pendências. **O "Substituir tudo" estoura com `23503` em quatro das seis filiais de
    produção.** ⚠ Contando pela filial DA ÉPOCA (`movimentacoes.filial_id` ou `pendencias_item.filial_id`), a Matriz
    dá 17 — a 17ª é de um ativo que hoje está em Eusébio. **Todo delete, desvínculo, contagem e backup usa o critério
    da RPC, nunca o `filial_id` histórico** — senão um import da Matriz apaga pendência de ativo de Eusébio.

30. **O que a explosão deixa para trás.** A RPC aborta e nada é apagado — mas `23503` **não está** em
    `RECUSAS_DA_RPC` (`actions/importar.ts:90`: `P0001`, `22023`, `42501`, `57014`), então o backup FICA; o evento
    `import_falhou` grava o caminho sob a chave `backup_descartado` **mesmo quando ele não foi descartado**
    (`:588-599`); e a 12ª checagem só olha `import_logs.backup_path` e `eventos_admin.detalhe->>'backup_path'` (hoje
    no núcleo, `0138:257-264`). Resultado: mais um backup órfão — e `backup_orfao` de produção é CATRACA em 10
    (`scripts/smoke/linha-de-base.json`). **Uma tentativa de import na Matriz hoje abre uma issue de alarme no dia
    seguinte.**

31. **O caminho de apply.** A migration que recria `import_apagar_acervo_filial` contém `delete from public.ativos`:
    pelo `RUNBOOK-BANCO.md`, caminho **B**. Mas a ata de 09/09 (*"DIVERGÊNCIA DO RUNBOOK — o gate não disparou"*)
    mediu que o classificador **não** dispara na DEFINIÇÃO de função — o corpo não é executado no apply —, com dois
    precedentes no Anexo A do runbook (`0048` e `0064`) e o apply da `0131`/`0132` na v1.59.1. Aquele apply foi por
    script que lia os bytes do disco com o token da Management API — e a F55 tirou o token do `.env.local` e o pôs no
    cofre do Windows. O molde vivo é o da F55: `apply_migration` do MCP (`docs/f55-evidencias/C2-apply-0138.txt`).
    Com o MCP, o SQL passa pelo agente — o risco de transcrição do incidente F7E —, então a prova é depois, e tem
    duas metades: o `prosrc` de cada função recriada, normalizado (`md5(regexp_replace(prosrc,'\s+',' ','g'))`),
    contra o corpo entre os `$$` do ARQUIVO, normalizado igual e extraído por `scripts/db/corpo-vigente.mjs` (o
    `pg_get_functiondef` inteiro nunca bate com o arquivo: o Postgres reescreve o cabeçalho); e a sonda de paridade
    ensaio × produção do `RUNBOOK-BANCO.md` (§*Sonda de paridade*). Decisão (iv): o agente aplica em ensaio e
    produção. E a `0139` (sem `delete`, caminho A) sai sozinha se a `0140` ficar presa.

32. **O vínculo `lancamentos_item.movimentacao_id` tem poucos leitores.** A ficha do ativo (*"o que foi junto"*,
    `ativos/[id]/page.tsx:114`, `itens-que-foram-junto.tsx`), o estorno com itens (`0121`/`0122`) e
    `nova-movimentacao-form.tsx:1051`. `saldo_colaborador` (`0118`) não o lê. Desvincular não deveria mudar saldo
    nenhum — **o que se prova, não se supõe**: saldo de itens e `saldo_colaborador` antes = depois. `valida_lancamento_item`
    é `before insert` só (`0015:115-117`), e a `guarda_acervo` (`0081`) libera qualquer operação dentro da janela
    `estoque.dev_destrutivo` — que a orquestradora já abre antes de chamar a auxiliar (F51: a janela fica no topo).

33. **As contagens, o retorno e a orquestradora.** `import_revalidar_contagens` (`0131:226-274`) lê QUATRO chaves de
    `p_contagens` (`ativos`, `movimentacoes`, `anotacoes`, `termos`) e **ignora chave a mais**. Três exigências desta
    ordem — chave ausente não pode virar "não confira" (a dívida N), o deploy fora de ordem não pode quebrar em
    nenhuma direção, e código velho no ar com a RPC nova — só se conciliam com **uma** regra: **chave nova AUSENTE vale
    0 e é conferida contra o estado vivo** (na janela entre o apply e o deploy, só as filiais que já estouravam são
    recusadas — agora com mensagem, em vez de `23503`). O precedente da casa para a mesma chave no reset é o oposto
    (`coalesce(…, -1)`, `0083:196`, `0089:169`), que recusaria TODO import nessa janela — divergência a declarar.
    O retorno da RPC é montado na ORQUESTRADORA, com oito chaves fixas (`0132:565-574`): para devolver as contagens
    novas, a `0140` recria também `importar_ativos_substituir` (corpo vigente na `0132`, EXECUTE para `authenticated`;
    as auxiliares seguem fechadas nos quatro papéis). E há QUATRO mutações presas ao texto das funções recriadas —
    `import-revalidacao-nao-compara-o-vivo` (a condição de duas linhas, `scripts/db/mutacoes.mjs:708-728`),
    `import-sem-revalidacao-de-contagens`, `import-trilha-do-apagado-mente-nas-anotacoes` e
    `f52-import-perde-a-guarda-de-filial` (o bloco `pode_escrever_filial` da orquestradora) —, e `trocarNoCorpo` lança
    erro no CARREGAMENTO do catálogo se o trecho sumir ou aparecer duas vezes (`scripts/db/corpo-vigente.mjs:323-341`):
    recriar as funções exige reapontar as quatro no mesmo commit. O precedente de campo novo à prova de
    deploy fora de ordem no retorno é `conflitos_abertos: z.number().default(0)` (`actions/importar.ts:157-171`).

34. **O backup e a restauração.** `exportarAcervoFilial` (`import-logs.ts:222`) lê ativos, movimentações, anotações
    e termos; o cabeçalho tem `versao: 1` e um `nao_incluido` com a linha que a F54 escreveu *"para o dia em que a
    RPC aprender a apagá-la"* — **esse dia é esta fase**. `src/lib/actions/backup-formato.test.ts` congela as chaves
    de topo e exige bump de `versao` quando entra tabela; `backup-completude.test.ts`; `scripts/db/restaurar.mjs`
    (`versaoDoBackup`; a ordem topológica `ativos → movimentacoes → pendencias_item → lancamentos_item → anotacoes →
    termos_gerados`, `PLAN-F54.md` §4) e `supabase/tests/restauracao.sql`. ⚠ O restaurador de hoje insere qualquer
    array que venha sob nome de tabela e **não recusa versão desconhecida** (`restaurar.mjs:203-210`, `:298-301`):
    os vínculos desfeitos vão sob CHAVE PRÓPRIA — nunca sob `lancamentos_item`, que ele tentaria inserir como linha —,
    e ele passa a recusar versão acima da que conhece.

35. **O CI não enxerga a FK adiada.** Os roteiros rodam dentro de `begin … rollback` (`import_substituir.sql:64`,
    `:487`): a chave `pendencias_item.movimentacao_id`, adiada para o commit, **nunca é conferida lá** — um erro de
    ordem nela passa verde no CI e só estoura no commit de produção. O cenário novo faz `set constraints all
    immediate` antes de chamar a RPC — e `set constraints all deferred` logo depois: `aplicar_movimentacao` depende do
    modo adiado para gravar pendência, e uma devolução com item faltante mais adiante na mesma transação daria `23503`
    (a armadilha já escrita em `restauracao.sql:253-260` e `restaurar.mjs:44-49`). E uma mutação que levante `23503` no meio do bloco é classificada como "roteiro
    abortou" (`run-mutation-tests.mjs:315-321`), que reprova — a lição que a F51 já registrou: o cenário captura a
    exceção e emite o ✗ do rótulo NOMEADO.

## Frente G — o smoke do import, a única prova que conta

36. **O smoke do import NUNCA existiu.** A F51 prometia *"o smoke do import contra o ensaio com CSV 100% fictício"* e
    o relatório dela escreveu, com todas as letras, *"o smoke nunca exercitou o import"*; a F52 repetiu. O
    `smoke-prod.mjs` é só-leitura de produção. Não há script, fixture nem harness de import: esta fase o constrói.

37. **O que existe para construir em cima — e a armadilha do mesmo diretório.** `scripts/design/capturar.mjs` (sobe o
    Next local com um arquivo de env, confere o ref, dirige o Playwright — F40/F43/F44); `scripts/env-guard.ts` (a
    lista de PERMISSÃO `REFS_DE_ENSAIO` e `exigirBancoDeDesenvolvimento`, que confere `rotulo_de_ambiente() =
    'desenvolvimento'` pelo próprio banco — e que só responde à chave de serviço, `env-guard.ts:126-160`); os
    navegadores do Playwright instalados nesta máquina (chromium 1234). O `.env.local` aponta para o **ENSAIO** desde a
    F55 — conferido hoje sem ler valor: `NEXT_PUBLIC_SUPABASE_URL` com o ref do ensaio e `SUPABASE_SERVICE_ROLE_KEY`
    preenchida. ⚠ **Mas ele também tem `SMOKE_SUPABASE_URL`, `SMOKE_EMAIL` e `SMOKE_SENHA` apontando para PRODUÇÃO, com
    a conta ADMIN do ritual pós-deploy** (`INVENTARIO-CREDENCIAIS.md` §2), e o `smoke-prod.mjs:82-88` resolve `SMOKE_*`
    ANTES de `NEXT_PUBLIC_*`. Um script novo em `scripts/smoke/` que copie essa cascata mira produção, como admin.
    O smoke do import lê só `NEXT_PUBLIC_*` e a chave de serviço, e confere o ref e o rótulo do banco antes de
    qualquer login.

38. **O ensaio não tem admin fictício.** Perfis lá: 1 admin ativo (**não** é persona do seed — não use), 1 admin
    inativo, 1 operador e 1 `consulta` (`seed.consulta@wap.ind.br`, criada pela F55 sem rodar o seed). O seed define
    `seed.admin@wap.ind.br` (`scripts/seed.ts:1232`), e a unidade 2b da F55 (ata de 10/09 em `docs/DECISOES.md`) é o
    precedente de criar persona no ensaio **sem rodar o seed** — que recusaria: o ensaio tem 1.602 ativos. ⚠ Aquela
    persona era `consulta`, com a senha fictícia que está no repositório (`seed.ts:1142`). **Esta é ADMIN** — importa,
    apaga acervo, entra em `/admin` — num projeto exposto que pode guardar cópia de dado real: senha aleatória por
    execução, nunca escrita em repositório, log ou evidência, e a persona desativada no fim do smoke, com trilha — pelos
    verbos que já existem (`papel_alterado`, `usuario_reativado`, `usuario_desativado`), ou por um verbo novo decidido
    ANTES da `0139`, porque ele tem de estar no comentário dela (fato 12). E `wap.ind.br` é domínio REAL: conta criada,
    reativada ou com senha trocada só por `auth.admin.createUser`/`updateUserById`, nunca por convite nem por
    "esqueci a senha", que mandam e-mail.

39. **As armadilhas do smoke.** (a) Desde a v1.59.1, o mesmo arquivo não reimporta na mesma filial em **24 h**
    (idempotência por `arquivo_hash`, `0132`) — o conteúdo varia a cada execução **e entre os passes da mesma
    execução**. (b) A RPC exige o backup EXISTINDO no bucket sob `import/filial-<id>/` (`prefixo_backup_import`) e a
    confirmação digitada dentro de `p_plano`. (c) A linha de base do alarme no ensaio é **zero** em `backup_orfao`,
    `conflito_entre_filiais` e `ativo_filial_inativa` — o smoke não pode deixar nenhum: patrimônios fictícios que não
    existam em outra filial do ensaio, `sede` ativa, nenhum backup sobrando. (d) O ensaio pode guardar cópias de dado
    real do ensaio de go-live — o smoke **nunca** substitui o acervo de uma filial que já existe lá: só o de `sede`, que
    ele mesmo cria. (e) O classificador pode barrar a EXECUÇÃO da RPC destrutiva mesmo numa filial vazia do ensaio —
    já barrou na F7 (*"o gate era o classificador do modo automático, que barra a execução do import destrutivo"*,
    `docs/prompts/README.md`).

## Frente H — as travas e o fechamento

40. **O censo do `sem-wapismo`.** Os cinco nomes aparecem em 30 arquivos não-teste de `src/**`, mas, fora de
    `lib/import/deparas.ts` (19) e `tipos.ts` (4), quase tudo é COMENTÁRIO (*"o operador de Serra…"*), dois são
    PLACEHOLDER (`filial-dialog.tsx:148` *"Ex.: Linhares"*; `criar-senha-dialog.tsx:204`), dois são o histórico do
    operador em `versoes/registry.ts` (`:210`, `:967` — texto datado, não se reescreve), quatro estão na ajuda, e um é
    FALSO POSITIVO (`celulasDaMatriz`, `itens-table.tsx:438` — "matriz" de grade). E `LayoutImport = 'matriz' | 'cd' |
    'padrao20'` (`tipos.ts:80`) nomeia os LAYOUTS do CSV pelas planilhas da WAP, em minúsculas. A trava tem de dizer o
    que varre (literal de string e de template × comentário), a regra de caixa e uma allowlist NOMINAL — e nascer
    VERMELHA contra o repositório de hoje. (Decisão 12.)

41. **A ajuda.** `src/lib/ajuda/conteudo/`: 39 arquivos (4 de teste), 5.914 linhas de conteúdo e 3.167 de teste; 5
    ocorrências dos cinco nomes e 33 de "WAP" no conteúdo; **424** `toContain` nos testes da ajuda.
    `import-de-startup.ts` descreve o wizard (os cards de Site, o *"Definir como {filial}"*) e o que o "Substituir
    tudo" apaga — os bloqueantes novos, os tetos, os apelidos em Filiais e o destino de lançamentos e pendências de
    item mudam o que o operador vê, então a ajuda muda nesta fase; teste da ajuda só muda onde o conteúdo mudou de
    verdade.

42. **O fechamento tem lugares certos.** O `registry.ts` recusa 21 termos de desenvolvedor (`registry.test.ts:160`);
    `docs/MATRIZ-REGRAS.md` — família `R-IMP-`, a última é `R-IMP-41` (leia o fim do arquivo); a spec: o §5 tem as
    linhas *"Unidades:"* e *"Prefixos vistos"* que passam a morar no banco, e o §10.2 diz o que o "Substituir tudo"
    apaga, que custo o preview mostra e cita os 8 MB (`ESPECIFICACAO.md:406`, `:415`, `:418`) — as três coisas mudam;
    `docs/ARQUITETURA.md` §10 aponta *"um vocabulário De→Para (motivo, unidade) → `src/lib/import/deparas.ts`"* — a
    linha fica falsa; o injetor de mutações está no teto que a F55 deixou (`scripts/db/mutacoes.test.mts`).

43. **Esta mesa**: Windows, PowerShell, Node 26.4, Claude Code 2.1.222; **sem `psql`, sem CLI da Supabase no PATH,
    sem CLI da Vercel** (conferido hoje). `npm run db:test` não roda aqui — quem roda os roteiros é o
    `banco-sem-docker` do PR, e você **lê a saída dele**. O `gh` está em `C:\Program Files\GitHub CLI\gh.exe` e pode não
    estar no PATH da sessão. O `npm run db:types` gera de PRODUÇÃO só com `DB_TYPES_PROJECT_REF` no ambiente do
    processo — sem ela, usa `--linked`, que é o ENSAIO (`scripts/gen-types.ts:42-61`) — e precisa do token da
    Management API, que desde a F55 mora no cofre do Windows (a CLI o lê). Prefira ele: o `generate_typescript_types`
    do MCP não usa a CLI fixada em 2.109.1, e a 2.110.0 REGRIDE a nulabilidade das sete `rel_*`
    (`scripts/gen-types.ts:45-57`) — se usar o MCP, confira o diff dessas sete. E a cota de Actions é o limite de sempre (o relatório da F55 projetou 2.579 a
    2.953 min/mês contra 2.000 do Free): agrupe os pushes.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Tirar o vocabulário da WAP do tipo e do código do import de startup, e desarmar as bombas do motor. Ao final:
(1) uma filial fora do vocabulário recebe UM bloqueante verdadeiro (`filial_fora_do_vocabulario`), nunca mais N
linhas de `site_divergente` que culpam o arquivo — é o primeiro commit de código;
(2) o De→Para inteiro mora no banco — `unidades_apelidos (filial_id, apelido)` e o vocabulário de Tipo, Situação e
prefixo de patrimônio, com o seed EXATO de hoje (13 apelidos — os outros 5 dos 18 históricos são o próprio nome das
filiais —, 5 categorias, 17 estados com as 12 formas de exibição, 7 prefixos) —, o nome da própria filial vale
sempre, a unidade é o `filial_id`, o motor recebe o vocabulário por parâmetro, e nenhuma palavra da WAP sobra no
código do import;
(3) Administração › Filiais mostra e edita os apelidos de cada filial, com trilha na Auditoria, e nenhum caminho
— criar filial, renomear, cadastrar apelido — deixa o vocabulário ambíguo;
(4) os enums do import vêm do banco, e a regex de patrimônio tem uma fonte só;
(5) os tetos conversam — arquivo, linhas, colunas, correções e os cinco corpos que atravessam a Vercel, contra o
limite REAL de produção (4,5 MB, pedido e resposta) —, o CSV ganha teto, e linha desalinhada é recusada em vez de
importar valor na coluna errada;
(6) o "Substituir tudo" deixa de estourar por chave estrangeira pelos cinco caminhos do fato 27 — desvincula os
lançamentos de item do acervo substituído (da movimentação e da pendência), apaga as pendências de item dele e solta
o ponteiro de substituto que venha de outra filial —, sem mudar saldo de item nenhum, com backup e restauração
cobrindo tudo;
(7) o smoke do import existe e passou no ENSAIO, contra uma filial chamada `sede` com planilha 100% fictícia — a
única prova que conta.
Versão **1.61.0** com tag publicada; PR mergeado com `verificar` e `banco-sem-docker` verdes; `0139` e `0140`
aplicadas em ensaio e em produção por você (decisão iv) — a `0140` presa no classificador vira handoff, com o
código provado compatível com a RPC antiga.
**Nenhuma dependência nova. Nenhum serviço novo. Nenhum `empresa_id`. Nenhum import executado em produção. Nenhum
dado real em teste, fixture, evidência, smoke ou log.**

# Contexto

## Leia antes de escrever qualquer código
- `@docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md` — o CABEÇALHO desta ordem, fora deste bloco, traz
  os **43 fatos medidos** em 11/09/2026. Leia-os primeiro; o resto deste prompt os cita pelo número. Se o arquivo
  não estiver lá, refaça as medições do zero antes de qualquer código.
- `@CLAUDE.md` manda em tudo: modo autônomo e as regras permanentes. Pesam aqui a **1** (escopo), a **2** (NUNCA
  dados reais — e esta fase escreve smoke, fixture e seed), a **3** (R$ 0), a **5** (produção com autoproteção — e
  aqui ela significa: em produção, só o apply das duas migrations), a **6** (doc oficial antes de escrever: Next 16,
  React 19, Supabase **e os limites da Vercel**) e a **8** (versão, sem exceção). E o parágrafo da F39 na regra 2: o
  vocabulário que o banco guarda desce por PROP a partir de um Server Component.
- `@AGENTS.md` — *"This is NOT the Next.js you know"*: leia `node_modules/next/dist/docs/` antes de mexer em
  `serverActions.bodySizeLimit`, na serialização de argumento de Server Action e de prop de Server para Client
  Component. E a doc da Vercel *"Vercel Functions Limits"* (pelo MCP da Vercel ou pela web) — o fato 22.
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns — em especial a **2**, estado de repouso;
  a **3**, escopo fora explícito; a **4**, trava antes da correção; a **8**, migration nunca se edita; e a **10**,
  ordem de rollback), **§5 → F56** (a ficha), **§5 → F51 e F52** (a decomposição e as guardas que esta fase mexe) e
  **§7 → F64, F65 e F73** (quem herda as tabelas novas).
- **As quatro decisões do Johnny para esta fase (11/09/2026):** (i) consertar a bomba de FK do import — desvincular
  os lançamentos de item e apagar as pendências de item do acervo substituído, com backup e restauração; as outras
  quatro RPCs destrutivas ficam no backlog (fatos 27–35); (ii) Tipo e Situação também no banco, com o seed exato de
  hoje, e nenhuma palavra da WAP no código do import — o que alcança os 7 prefixos (fato 7); (iii) Administração ›
  Filiais vê e edita os apelidos, com trilha na Auditoria, e o nome da própria filial vale sempre (fato 14); (iv) a
  `0140` é aplicada POR VOCÊ em ensaio e produção, como na v1.59.1 (fato 31).
- O motor, inteiro: `@src/lib/import/tipos.ts`, `deparas.ts`, `plano.ts`, `parse.ts`, `xlsx.ts`, `limites.ts`,
  `correcoes.ts`, `resolver-patrimonio.ts`, `index.ts` e os testes deles; `@src/lib/patrimonio.ts`;
  `@src/lib/validators/importar.ts`; `@src/lib/actions/importar.ts` (inteira — o cabeçalho, `RECUSAS_DA_RPC`, o
  backup, o ramo de erro e o `rpcRetornoSchema`); `@src/lib/queries/import-logs.ts` (`custoSubstituir`,
  `exportarAcervoFilial`); `@src/lib/storage/copiar-antes-de-remover.ts`; `@next.config.ts`.
- A tela: `@src/app/(app)/admin/importar/page.tsx`, `@src/components/admin/importar/importar-wizard.tsx`,
  `grupos-erros.tsx`, `ops-grupo.ts` e o teste dele; `@src/app/(app)/admin/filiais/page.tsx`,
  `@src/components/admin/filial-dialog.tsx`, `@src/lib/actions/admin.ts` (filiais), `@src/lib/validators/admin.ts`;
  `@src/lib/auditoria.ts` e `@src/lib/auditoria-registro.ts`; `@src/lib/itens/rotulo-tipo.ts` (o molde da F39); os
  três `.test.tsx` de `src/components/layout/` (o molde do teste de componente).
- O banco: `@supabase/migrations/0131_import_decomposto.sql` e `0132_guardas_de_escopo.sql` (os corpos VIGENTES da
  cadeia do import — as duas auxiliares estão na `0131`, a orquestradora na `0132`; leia o mapa de blocos);
  `0116` e `0119` (os dois elos de `lancamentos_item`); `0050`/`0051` (`pendencias_item`); `0015` (o gatilho de
  validação do lançamento); `0081` (a `guarda_acervo`); `0089` (o reset — o precedente dos `ponteiros_perdidos`);
  `0112` e `0125` (a chave normalizada em SQL sem extensão); `0114` (o molde de vocabulário administrado); `0138`
  (o núcleo das checagens, com a 12ª); `0137` (o molde do comentário da trilha); `0007`/`0026` (as filiais do seed).
- Os roteiros e o CI: `@supabase/tests/import_substituir.sql`, `import_fora_da_unidade.sql`, `restauracao.sql`,
  `catalogo_policies.sql`, `catalogo_secdef.sql`, `definer_sem_tenant.sql`, `seguranca_catalogo.sql`,
  `papeis_rls.sql`, `isolamento_tenant.sql`, `_asserts.sql`; `@scripts/db/corpo-vigente.mjs`, `mutacoes.mjs`,
  `mutacoes.test.mts`, `run-mutation-tests.mjs`, `restaurar.mjs`, `diff-tipos.mjs`, `rodar-roteiros.sh`;
  `@scripts/gen-types.ts`; `@src/lib/actions/backup-formato.test.ts` e `backup-completude.test.ts`;
  `@src/lib/validators/tipos-item-sql.test.ts`, `@src/lib/colaboradores/chave-sql.test.ts` e
  `@src/lib/itens/chave-sql.test.ts` (os moldes de guarda TS↔SQL); `@src/lib/validators/import-uma-porta.test.ts`;
  `@.github/workflows/ci.yml` e `@src/lib/ci-passos.test.ts`.
- O smoke e as guardas: `@scripts/design/capturar.mjs` (sobe o Next local contra um env, confere o ref, dirige o
  Playwright), `@scripts/env-guard.ts` (`REFS_DE_ENSAIO`, `exigirBancoDeDesenvolvimento`),
  `@scripts/smoke/README.md` e `smoke-prod.mjs:82-88` (a cascata que o smoke novo NÃO pode copiar — fato 37),
  `@scripts/seed.ts` (as personas fictícias — só a definição; o seed NÃO roda), `@docs/INVENTARIO-CREDENCIAIS.md`.
- `@docs/RUNBOOK-BANCO.md`: *"O caminho, em 30 segundos"*, *"O gate do modo automático"*, *"Aplicar uma
  migration"* (A e B), *"security definer — três exigências"*, *"Rollback"*, *"Restauração"*, *"Roteiros de teste
  SQL"*, *"Sonda de paridade"*, *"A trava de hash"* (e *"Quem acrescenta migration atualiza DUAS listas"*),
  *"Armadilhas"* e *"Escalada"*. E `@docs/f55-evidencias/C2-apply-0138.txt` — o apply pelo MCP que você vai repetir.
- `@docs/RELATORIO-F54.md` §9 e §11 (o achado da FK), `@docs/RELATORIO-F55.md` §12 (o backlog *"Para a F56"*) e a
  ata de 09/09 *"DIVERGÊNCIA DO RUNBOOK — o gate não disparou"* em `@docs/DECISOES.md` — que tem 1,2 MB: **busque,
  não leia inteiro**. `@docs/ESPECIFICACAO.md` §5 (os vocabulários) e §10.2 (o import).

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Os 43 fatos estão no cabeçalho. **Refaça cada medição**: as seis filiais de produção e as cinco do ensaio; as linhas
da ficha em `tipos.ts`, `plano.ts` e `correcoes.ts`; cada consumidor do vocabulário, e se ele roda no cliente ou no
servidor; os 13 + 5 apelidos, as 5 categorias, os 17 estados, as 12 formas de exibição e os 7 prefixos; as quatro
cópias da regex e a regex morta do SQL; o limite da Vercel e os cinco corpos; o ponto exato em que o backup sobe; as
cinco chaves estrangeiras e a contagem por filial pelo critério da RPC; o que lê os dois elos de `lancamentos_item`;
as quatro chaves de `p_contagens` e o retorno montado na orquestradora; os perfis do ensaio. Onde a sua medição
divergir da minha, **a sua ganha** — desde que ela esteja no relatório com a divergência explicada.

**Cinco medições são obrigatórias antes de escrever código, e nenhuma está no cabeçalho:**
(1) **Os cinco corpos do fato 22, em BYTES** — com o serializador que o Next usa de verdade para argumento e para
resposta de Server Action (confira na doc local; não é `JSON.stringify`), nos três layouts, com dados 100% fictícios,
em dois perfis de linha: o realista (a medição da F7F dá ~580 B por ativo no plano) e o de pior caso (cada campo no
`.max()` que você for propor, com caractere multibyte), e com o pior tipo de correção. O limite é o MENOR entre o
`bodySizeLimit` e os 4,5 MB da Vercel. É dessa tabela que saem os tetos (Decisão 6).
(2) **A expansão do `.xlsx`** — um `.xlsx` fictício gerado para isso, o mais compressível que o formato permitir,
lido num PROCESSO FILHO com `--max-old-space-size` e timeout: memória e tempo de `lerXlsx` até o `rowCount`. O
arquivo não entra no repositório. É o que decide a Decisão 7.
(3) **O estado da FK nos dois bancos** — refaça o fato 29 em produção e no ensaio, pelos cinco caminhos do fato 27 e
pelo critério da RPC (a filial ATUAL do ativo), só TOTAIS por filial, nunca linha; e liste as funções, views e
queries que leem `lancamentos_item.movimentacao_id`, `lancamentos_item.pendencia_item_id`, `pendencias_item` e
`ativos.substitui_ativo_id` — o conserto não pode mudar nenhum número que elas devolvem fora do acervo substituído.
(4) **A normalização, caractere a caractere** — `normalizarTexto` contra a tabela de `translate` de
`colaborador_chave`/`item_chave`: onde elas divergem (a faixa U+0300–U+036F inteira, o `:` final, NFD × NFC). É o
que decide a Decisão 1.
(5) **O `.env.local` desta máquina, por NOME e por REF — nunca por valor**: `NEXT_PUBLIC_SUPABASE_URL` aponta para o
ensaio; `SUPABASE_SERVICE_ROLE_KEY` está preenchida e é aceita por `rotulo_de_ambiente()` como `'desenvolvimento'`;
e as `SMOKE_*` apontam para produção (fato 37) — é delas que o smoke novo tem de ficar longe.

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste` ·
  `npm run verificar:actions`
- `npm run db:test` · `npm run db:test:um <roteiro>` · `npm run db:test:mutations` · `npm run db:types:diff` —
  precisam de `psql`/`DATABASE_URL`, que esta mesa NÃO tem (fato 43): o `banco-sem-docker` do PR roda os quatro, e
  você lê a saída com `gh run view --log-failed`.
- `npm run db:lock` — **obrigatório** no mesmo commit de cada migration.
- `npm run db:types` — de PRODUÇÃO, com `DB_TYPES_PROJECT_REF` apontando para o projeto de produção no ambiente do
  processo e o token da Management API (no cofre do Windows desde a F55 — a CLI o lê), ou, em último caso, o
  `generate_typescript_types` do MCP em produção, conferindo o diff das sete `rel_*` (fato 43). **Antes do primeiro push com a `0139`**, o `database.ts`
  já tem de conhecer as tabelas dela (fato 13): hand-fix datado, porque ela só vai a banco real depois do CI; no fim,
  regenere de produção.
- `node scripts/smoke/smoke-prod.mjs` (o ritual pós-deploy, só-leitura, contra produção).
- `gh` — em `C:\Program Files\GitHub CLI\gh.exe`, pode não estar no PATH. *"Comando não encontrado" é hipótese,
  não conclusão.*

# Escopo

## Dentro — oito frentes, nesta ordem

### Frente A — a correção imediata
- **O primeiro commit de CÓDIGO, sozinho** (a ordem e o `PLAN-F56.md` podem ir antes, num commit de documentação):
  com a filial selecionada fora do vocabulário, o motor emite UM bloqueante `filial_fora_do_vocabulario` — mensagem
  verdadeira, que aponta o cadastro, não o arquivo — em vez de um `site_divergente` por linha; o card
  correspondente é informativo. E um aviso na tela de cadastro de filial dizendo que o import só reconhece a coluna
  Site pelo vocabulário. Teste com uma `FilialSelecionada` de slug inventado. **É o estado de repouso da fase:** se
  ela parasse aqui, a Filial de Teste já receberia a mensagem certa. Depois da Frente D o gatilho muda (fato 5) — e o
  teste muda junto, com ata.
- **Trava antes da correção** (regra 4 do §4), sem push vermelho: cada trava desta fase é provada **VERMELHA no
  começo da SUA frente**, contra o repositório daquele momento, com a saída guardada em `docs/f56-evidencias/`, e
  entra no commit junto da correção que a deixa verde. Nenhum push com teste Vitest ou trava sabidamente vermelha —
  cada push custa CI numa cota no limite (fato 43). As travas: `sem-wapismo.test.ts` (Decisão 12, prova vermelha no começo da Frente
  D), `limites.test.ts` (Frente C), `enums-sql.test.ts` e `patrimonio-sql.test.ts` (Frente B), a guarda do
  vocabulário contra o seed (Frente D) e a do desalinhamento (Frente C). Onde uma trava só puder nascer verde, ela
  vem no mesmo commit da correção, com o porquê na ata.

### Frente B — tipos, enums e a regex
- **Os enums do import vêm do banco**: `Enums<'status_ativo'>` e a categoria como exclusão de `outro` sobre
  `Enums<'categoria_ativo'>`, pelo utilitário estrito do fato 17 (`U extends T`). O estado-alvo do import exclui por
  tipo o que o import nunca produz (`descartado` como alvo é bloqueante; `devolvido_fornecedor` nunca é alvo) — e aí
  a exclusão deixa de ser no-op. `enums-sql.test.ts` compara as uniões do import com `Constants` de `database.ts` e
  carrega o `@ts-expect-error` do valor fora da união — provado num caminho de CI que reprova.
- **A regex de patrimônio numa fonte só** (fato 18): as partes compartilhadas (o prefixo e os dígitos) moram em
  `src/lib/patrimonio.ts`; a canônica, a da canonicalização e a da faixa derivam delas; a do hostname deriva do mesmo
  prefixo, com a quantificação `{1,7}` explícita ao lado e a divergência documentada como deliberada.
  `patrimonio-sql.test.ts` fala do corpo VIGENTE (fato 19). Comportamento idêntico, provado pelos testes que já
  existem — nenhum patrimônio que canoniza hoje deixa de canonizar, e vice-versa.

### Frente C — os tetos e o arquivo desalinhado
- **`conferirTetos` na primeira linha de `analisar()`**, linhas e colunas, nos dois formatos — o CSV passa a ter os
  mesmos tetos e as mesmas mensagens que o `.xlsx` já tem (`msgLimiteLinhas`/`msgLimiteColunas`).
- **A conta dos tetos numa fonte só, contra o limite REAL** (fatos 22–24, Decisão 6): o limite de corpo é o MENOR
  entre o `bodySizeLimit` e os 4,5 MB da Vercel, e os CINCO corpos têm de caber nele com folga — os três pedidos e as
  duas respostas. Arquivo, linhas, colunas, correções e o limite moram em `limites.ts` (e o `next.config.ts` passa a
  ler dali, ou o teste lê o `next.config.ts` — decida; alinhar o `bodySizeLimit` ao limite da plataforma faz o `next
  dev` se comportar como produção). `limites.test.ts` prova a desigualdade para os cinco corpos, com os números da
  medição 1, e reprova quando QUALQUER número muda sem a conta ser refeita. **Se o arquivo de 5 MB não cabe, o teto do
  arquivo desce** (os inventários reais são de dezenas a centenas de KB — `limites.ts:9-11`), com a mensagem da tela
  acompanhando; e o teto de linhas fica acima da Matriz com a folga escrita (fato 4) — se a conta empurrar abaixo
  disso, quem se move é outro número (um `.max()` de campo, o teto de correções), nunca a Matriz.
- **`.max()` em `planoImportSchema`** (fato 23): no array e em cada campo de texto, coerentes com a conta — o do
  patrimônio no mesmo teto da RPC (60) — e o motor RECUSA célula acima do teto do campo em vez de truncar (a doutrina
  da dívida T: recusar, nunca cortar), para que o preview nunca produza um plano que o aplicar ou a RPC recusaria.
- **`linha_desalinhada`** (fato 26, Decisão 8): linha de CSV com células a mais — ou a menos que a largura útil do
  cabeçalho — é bloqueante, com a linha e a contagem na mensagem; no `.xlsx`, valor à direita da última coluna nomeada
  também. Linha em branco, `\n` final e colunas vazias à direita continuam passando — provado com fixture.
- **O `.xlsx` descomprimido** (fato 25, Decisão 7): a medição 2 decide se o teto passa a ser conferido antes do
  `load` (pela dimensão declarada da planilha ou pelo tamanho descomprimido do zip, sem dependência nova), ou se o
  pior caso realista cabe na função — com os números no relatório.

### Frente D — o vocabulário vira dado (migration `0139`)
- **As tabelas** (Decisão 1): `unidades_apelidos (filial_id → filiais, apelido)`, como a ficha nomeia, e o
  vocabulário de Tipo, Situação e prefixo de patrimônio (decisão ii) — termo → valor, com a FORMA DE EXIBIÇÃO de cada
  valor numa coluna própria (as 12 do fato 7: é dela que saem os Selects, o "Definir como", o CSV corrigido e o
  invariante de ciclo). Seed **EXATO** de hoje (fato 7): **13 apelidos** (os 18 históricos menos os 5 que são o
  próprio nome), por slug (fato 11), 5 categorias, 17 estados, 12 formas, 7 prefixos. RLS no padrão de vocabulário
  administrado (fato 13); os catálogos da F48 acolhem tudo por nome no mesmo commit; o comentário de
  `eventos_admin.acao` ganha os verbos da Frente E (fato 12); `npm run db:lock`; e o `database.ts` já conhece as
  tabelas antes do primeiro push.
- **O nome da própria filial vale sempre** (decisão iii) e **não vira linha no banco** — renomear a filial muda o
  nome que vale, sem sobra. **O vocabulário nunca fica ambíguo** (Decisão 2): um apelido em duas filiais, um apelido
  igual ao nome de outra, duas filiais com o mesmo nome normalizado — o BANCO é a primeira linha (a chave normalizada
  em SQL do fato 10) e recusa na criação de filial, no rename, no cadastro de apelido e, se a Decisão 2 tirar a
  filial inativa do vocabulário, na reativação; com mensagem que diz qual e onde. O construtor do vocabulário confere
  de novo e recusa alto se achar.
- **O motor por parâmetro** (fato 6, Decisão 3): a unidade deixa de ser um nome e passa a ser o `filial_id`;
  `FilialOficial`, `UNIDADES`, `SLUG_POR_FILIAL`, `filialPorSlug`, `CATEGORIAS`, `ESTADOS`, `TIPO_CANONICO`,
  `SITUACAO_CANONICA` e `PREFIXOS_PATRIMONIO` deixam de existir como dado no código; `mapearUnidade`,
  `mapearCategoria`, `estadoPlanilha`, `extrairPatrimonioDoHostname`, `aplicarCorrecoes`, `validarCorrecao`,
  `agruparErros` e a mensagem de `plano.ts:154` recebem o vocabulário — no padrão de `rotuloTipoItem(slug, mapa)`.
  Uma query só-servidor lê o vocabulário; **as duas actions que rodam o motor** (`validarImport` e
  `baixarCsvCorrigido`) o leem do banco a cada chamada; `aplicarImport` não roda o motor — recebe o plano já mapeado
  —, e o que ela confere com o vocabulário que ELA leu é que categoria e estado-alvo do plano estão entre os valores
  importáveis (mudar o transporte do plano está fora). A página passa uma cópia serializável por prop só para os três
  consumidores de cliente do fato 6. **O servidor nunca julga com o vocabulário que veio do cliente.**
- **A guarda do seed** (molde `tipos-item-sql.test.ts`): os literais vivem NO TESTE — 13 apelidos + os 5 nomes
  próprios = os 18 históricos, 5 categorias, 17 estados, 12 formas de exibição, 7 prefixos —, e o teste lê o SQL da
  `0139`; mais a paridade dos prefixos com `scripts/import/normalizar.ts` (a `prefixos.test.ts` da ficha); e a
  regressão da ficha: os 18 apelidos históricos, montados pelo construtor com as cinco filiais, mapeiam cada um para a
  filial certa.

### Frente E — a tela de Filiais (decisão iii)
- Em Administração › Filiais, cada filial mostra os apelidos dela e o admin **inclui e remove**: o nome da filial
  aparece fixo, como o que sempre vale; apelido que colide com outra filial é recusado com a filial dona na mensagem;
  a filial que só tem o próprio nome recebe o aviso de que a coluna Site precisa trazer exatamente esse nome. Server
  Actions com `exigirAdmin` + Zod + client de sessão (a RLS é `e_admin()`), trilha em `eventos_admin` com os verbos
  novos em `auditoria.ts` e no comentário da coluna (fato 12), `revalidatePath` da tela e do import.
- `criarFilial` e `atualizarFilial` recusam o nome que colide com o nome, ou um apelido, de outra filial (fato 14) —
  a mensagem amigável na action, a garantia no banco (Frente D).
- Teste de componente grau 1 (fato 15) do que a tela desenha: o nome fixo sem ação de remover, os apelidos, o aviso,
  os atributos de acessibilidade do campo.

### Frente F — a bomba de FK (migration `0140`, decisões i e iv)
- **`import_apagar_acervo_filial` recriada por `create or replace` puro** (mesma assinatura), dentro da janela que a
  orquestradora já abre (fato 32), tratando os cinco caminhos do fato 27 **pelo critério da RPC** — a filial ATUAL do
  ativo, nunca o `filial_id` histórico (fato 29) —, na ordem que as chaves imediatas exigem: desvincula
  (`pendencia_item_id = null`) os lançamentos que resolveram pendências do acervo; desvincula
  (`movimentacao_id = null`) os lançamentos presos às movimentações do acervo; apaga as pendências de item do acervo;
  anula o `substitui_ativo_id` dos substitutos de OUTRA filial que apontam para ele (o precedente do reset, com o
  valor guardado como `ponteiros_perdidos`); e só então apaga o que já apagava. Continua a ÚNICA função **da cadeia do
  import** com `delete from public.ativos` (a trava da F51 verde; no banco inteiro há outras, das ferramentas do dev).
- **As contagens conhecem as classes novas** (fato 33, Decisão 9): o preview (`custoSubstituir` e a tela do "o que
  será apagado"), o `contagens` do backup e a revalidação TOCTOU — com a regra do fato 33: **chave nova ausente vale
  0 e é conferida contra o vivo**, nunca "não confira" (a dívida N) e nunca `-1` (que recusaria todo import entre o
  apply e o deploy). A `0140` recria as TRÊS funções — a auxiliar, `import_revalidar_contagens` e a orquestradora
  `importar_ativos_substituir` (corpo vigente na `0132`), que monta o retorno —; as auxiliares seguem fechadas nos
  quatro papéis, a orquestradora segue com EXECUTE só para `authenticated`. No mesmo commit: as QUATRO
  mutações presas ao texto dessas funções (fato 33) reapontadas para o texto novo, e toda auxiliar nova em
  `import-uma-porta.test.ts` e em `catalogo_secdef.sql`.
- **O retorno da RPC** ganha as contagens novas, com `.default(0)` no `rpcRetornoSchema` (o precedente da F24), e o
  resultado na tela e o evento `import_executado` as mostram.
- **O backup vira `versao: 2`**: leva as pendências apagadas sob `pendencias_item` (linhas inteiras, como o backup
  do reset já faz e o restaurador já sabe inserir na ordem certa) e, sob CHAVES PRÓPRIAS — nunca sob o nome de uma
  tabela (fato 34) —, os elos originais dos lançamentos desvinculados (o id e o valor que saiu, de cada um dos dois
  elos) e os ponteiros de substituto soltos (as linhas inteiras, no molde de `ponteiros_perdidos`, fato 27); o `nao_incluido` é reescrito (a linha da F54 deixa de ser verdade);
  `backup-formato.test.ts` muda por desenho (com a ata) e `backup-completude.test.ts` fica verde.
- **A restauração**: `scripts/db/restaurar.mjs` entende a versão 2 — reinsere as pendências e religa os dois elos e o
  ponteiro, dentro da janela — e passa a **recusar versão acima da que conhece**; `restauracao.sql` ganha os cenários.
- **A prova no Postgres do CI** (fato 35): `import_substituir.sql` ganha, com `set constraints all immediate` antes
  da RPC e `set constraints all deferred` logo depois, uma filial com lançamento preso a movimentação, pendência de item, pendência RESOLVIDA com lançamento, um
  substituto em outra filial e um ativo TRANSFERIDO para outra filial com pendência de lá — o import passa; o saldo de
  itens e o `saldo_colaborador` são IDÊNTICOS antes e depois; as pendências do acervo sumiram e estão no backup; a
  pendência do ativo transferido e as outras filiais ficaram intocadas. E o injetor ganha uma mutação por metade do
  conserto (sem cada desvínculo, sem o apagar das pendências, sem a contagem nova), cada uma acusada pelo cenário
  NOMEADO — o cenário captura o `23503` e emite o ✗ do rótulo, em vez de abortar o roteiro.
- **O ramo de erro fica honesto** (fato 30, Decisão 10): o código de violação de integridade que a RPC devolve dentro
  da transação entra, ou não, em `RECUSAS_DA_RPC` pela régua escrita lá ("sei que não commitou"); e o evento
  `import_falhou` passa a gravar o caminho sob a chave que a 12ª checagem lê **quando o backup fica**, reservando
  "descartado" para quando ele saiu de fato.

### Frente G — o smoke do import no ENSAIO (a única prova que conta)
- **Um script novo em `scripts/smoke/`** (forma na Decisão 11) que só roda contra o ensaio: lê SÓ `NEXT_PUBLIC_*` e a
  chave de serviço — **nunca `SMOKE_*`**, que apontam para produção com a conta admin (fato 37) —, e antes de
  qualquer login confere o ref contra a lista de PERMISSÃO e o rótulo do próprio banco (`exigirBancoDeDesenvolvimento`).
  A recusa de alvo é provada por teste unitário da guarda (uma função pura, com o ref de produção e um inventado) —
  **nunca apontando o smoke para produção para ver se ele recusa**.
- **O preparo, no ensaio:** a persona fictícia `seed.admin@wap.ind.br` nasce lá sem rodar o seed (molde da unidade 2b
  da F55, fato 38), com **senha aleatória gerada na execução** — nunca escrita em repositório, log ou evidência —, só
  por `auth.admin.createUser`/`updateUserById` (nunca convite nem "esqueci a senha": o domínio é real e mandaria
  e-mail), e com trilha pelos verbos que já existem ou por um verbo decidido antes da `0139`; ela é **desativada no
  fim**. A filial `sede` ("Sede") é criada pelo smoke se não existir, e um apelido dela
  é cadastrado **pelo caminho novo da Frente E** — é assim que a tela de apelidos entra na prova.
- **Passe 1 — a unidade que o código não conhece:** planilha 100% fictícia (patrimônios que não existam em nenhuma
  outra filial do ensaio), com a coluna Site misturando o nome "Sede" e o apelido cadastrado → preview sem
  bloqueante → backup → RPC → N ativos em `sede`, conferidos no banco.
- **Passe 2 — a bomba, no mundo real:** em `sede`, um lançamento de item preso a uma movimentação de um ativo
  importado e uma pendência de item, criados pelos caminhos do próprio sistema; um segundo "Substituir tudo", com um
  arquivo de CONTEÚDO DIFERENTE (fato 39a), passa; o saldo do item em `sede` é o mesmo antes e depois, a pendência
  sumiu e está no backup, e o lançamento ficou sem vínculo.
- **Passe 3 — a WAP não regride:** só PREVIEW (não destrutivo), em cada uma das cinco filiais WAP do ensaio, com os
  apelidos históricos dela na coluna Site — nenhum `site_divergente` por apelido.
- **As doze checagens do ensaio iguais antes e depois do smoke** (totais, nunca amostra), nenhum backup órfão,
  nenhum conflito. O smoke nunca toca o acervo de uma filial que ele não criou (fato 39d).
- Se o classificador barrar a EXECUÇÃO da RPC ou a criação da persona (fato 39e), **não reformule**: o script fica
  pronto, o comando exato vai para o roteiro do Johnny, e o critério vira pendência declarada — não dispensada.

### Frente H — o fechamento
- A trava `sem-wapismo` verde, sem exceção fora da allowlist nominal.
- A ajuda do operador (fato 41): `import-de-startup.ts` e as páginas de mensagens e problemas do import dizem o que
  mudou — os bloqueantes novos, os tetos, os apelidos em Filiais e o que o "Substituir tudo" faz agora com
  lançamentos e pendências de item.
- `docs/ESPECIFICACAO.md` com a emenda do §5 (as unidades, os prefixos e o vocabulário do import passam a morar no
  banco, com o seed da WAP) e do §10.2 (o que o "Substituir tudo" apaga e desvincula, o custo do preview, os tetos
  reais); `docs/ARQUITETURA.md` §10 com a linha certa; `docs/MATRIZ-REGRAS.md` com as regras novas a partir de
  `R-IMP-42` (leia o fim do arquivo antes) e a `R-IMP-41` emendada — ela diz que o classificador barra o apply e manda
  o SQL para o SQL Editor, o que a ata de 09/09 e a decisão (iv) desmentem; a seção *"O gate do modo automático"* do
  `RUNBOOK-BANCO.md` emendada no mesmo sentido (a definição de função não dispara; a EXECUÇÃO pode); o cabeçalho de `limites.ts` corrigido (fato 22); atas em
  `docs/DECISOES.md`; `scripts/smoke/README.md` com o smoke novo e a `sede` como fixture permanente do ensaio.
- `CHANGELOG.md`; `package.json` **1.61.0**; `src/lib/versoes/registry.ts` em LINGUAGEM DE OPERADOR, de 2 a 6
  mudanças, sem os 21 termos (fato 42); tag anotada `v1.61.0`; PR com os dois checks verdes; deploy; o smoke
  pós-deploy (`smoke-prod.mjs`) contra produção.

## Fora — não toque
- **Onboarding pelo import** (criar empresa, filial, colaborador ou item), **`empresa_id`**, policies de Storage.
- **As outras quatro RPCs destrutivas** — reset de acervo, mesa de conflitos, apagar ativo, apagar movimentação
  (decisão i). Medir se elas continuam estourando pelos mesmos caminhos é bem-vindo e vai para o backlog; consertar,
  não.
- **Tela para editar o vocabulário de Tipo, Situação e prefixo** — o dado vai para o banco; a edição dele é
  onboarding.
- **`scripts/import/`** — a carga F4. A única coisa que esta fase faz com ele é LER a lista de prefixos na trava de
  paridade.
- Os três layouts do CSV — as colunas que cada um exige (o nome do identificador pode mudar pela Decisão 12); o modo
  *Atualizar*; a decomposição dos componentes gigantes do import; react-hook-form.
- **Mudar o transporte do plano** (reenviar o arquivo no aplicar, em vez do plano). Se a conta dos tetos mostrar que
  só isso resolve, registre e proponha no backlog.
- **Produção, fora do apply da `0139` e da `0140`**: nada de import, nada de filial, nada de persona, nada de apelido
  criado lá. O smoke roda só no ENSAIO, e só na filial que ele mesmo cria.
- **O acervo de qualquer filial que já exista no ensaio.**
- **Dependência nova**, de qualquer tamanho. **Serviço novo.** A medição do `.xlsx` no processo da sessão.
- **Migration já aplicada**: nunca se edita. **Teste existente** não se edita para ficar verde — exceto os que esta
  fase muda por desenho (o `backup-formato` pela versão 2, os do motor cuja assinatura mudou, o do primeiro commit
  quando o gatilho muda, os da ajuda cujo texto mudou), cada um com o motivo na ata.
- **Consertar achado de produção** que as medições revelarem (órfãos, conflitos): é dado, e dado se relata. E a
  linha de base do alarme não sobe.

# Critérios de aceitação
1. O **primeiro commit de código** da fase é a correção imediata: `filial_fora_do_vocabulario` como bloqueante único
   e verdadeiro, e o aviso no cadastro — provado com uma `FilialSelecionada` de slug inventado; e o gatilho final,
   depois da Frente D, está escrito e testado.
2. Cada trava nasceu **VERMELHA** no começo da sua frente (saída em `docs/f56-evidencias/`), entrou no commit da
   correção, e está verde ao final sem exceção fora das allowlists nominais; nenhum push levou teste Vitest ou trava
   sabidamente vermelha.
3. Nenhuma das constantes do fato 7 existe mais como dado em `src/lib/import/**` nem nos componentes do import; o
   motor recebe o vocabulário por parâmetro, e a unidade é comparada por `filial_id`.
4. A `0139` existe com as tabelas da Decisão 1 e o seed EXATO — 13 apelidos, 5 categorias, 17 estados, as 12 formas
   de exibição, 7 prefixos —, provado pela guarda que lê o SQL contra os literais do próprio teste; e os Selects, o
   "Definir como" e o CSV corrigido continuam gravando "Saída", "Empréstimo", "Manutenção" — com caixa e acento.
5. O nome da própria filial vale sempre, sem linha no banco; o vocabulário não fica ambíguo por nenhum caminho
   (criar filial, renomear, cadastrar apelido — e reativar, se a filial inativa sair do vocabulário) — o banco recusa,
   com mensagem que nomeia o termo e as duas filiais —, provado para cada um.
6. As duas actions que rodam o motor julgam com o vocabulário que ELAS leram do banco — provado: um vocabulário
   forjado no cliente não muda o resultado —; e `aplicarImport` recusa plano com categoria ou estado-alvo fora dos
   valores importáveis.
7. Os 18 apelidos históricos (13 do seed + 5 nomes próprios) mapeiam cada um para a filial certa (teste), e os
   prefixos do seed são os mesmos de `scripts/import/normalizar.ts` (trava).
8. Os enums do import vêm de `Enums<…>`, o utilitário estrito existe, e o `@ts-expect-error` do valor fora da união
   reprova num caminho de CI — provado por sabotagem.
9. A regex de patrimônio tem uma fonte só (as quatro cópias derivadas, a do hostname com a divergência escrita), os
   testes de patrimônio que já existiam passam sem mudança, e `patrimonio-sql.test.ts` fala do corpo vigente.
10. `conferirTetos` roda na primeira linha de `analisar()`; um CSV acima do teto de linhas ou de colunas é recusado
    com a mensagem do leitor.
11. `limites.test.ts` prova, com os números da medição 1 em bytes, que os CINCO corpos cabem no menor entre o
    `bodySizeLimit` e os 4,5 MB da Vercel, com folga — e reprova quando qualquer número muda sem a conta; o teto do
    arquivo e a mensagem da tela estão coerentes com isso; `MAX_LINHAS_PLANILHA` fica acima da Matriz com a folga
    escrita.
12. `planoImportSchema` tem `.max()` no array e em cada campo de texto (o patrimônio em 60, como a RPC), e o motor
    recusa a célula longa demais antes do aplicar.
13. `linha_desalinhada`: CSV com célula a mais, e com célula a menos que a largura útil, recusado; `.xlsx` com valor à
    direita do cabeçalho, recusado; arquivo legítimo com colunas vazias à direita, linha em branco e `\n` final,
    aceito — todos com fixture.
14. A medição do `.xlsx` descomprimido está no relatório (feita num processo filho com teto de heap), e a Decisão 7
    está aplicada.
15. A `0140` recria as três funções do fato 33; a auxiliar trata os cinco caminhos do fato 27 pelo critério da RPC,
    na ordem que as chaves exigem; e ela continua a única função da cadeia do import com `delete from public.ativos`.
16. Preview, backup e revalidação TOCTOU conhecem as classes novas, com a regra "ausente vale 0 e é conferido"; o
    deploy fora de ordem não quebra nas duas direções — provado ou demonstrado pela leitura dos corpos, com a
    conclusão no relatório.
17. O backup é `versao: 2`, com as pendências sob `pendencias_item` e os dois elos e os ponteiros sob chaves
    próprias; `nao_incluido`
    reescrito; `backup-formato` e `backup-completude` verdes; `restaurar.mjs` devolve tudo, recusa versão que não
    conhece, e `restauracao.sql` prova.
18. No CI (com `set constraints all immediate` antes da RPC e `deferred` depois), o import sobre a filial do cenário novo passa, com o saldo de itens e
    o `saldo_colaborador` idênticos antes e depois, a pendência do ativo transferido intocada, e as mutações novas
    acusadas pelo cenário nomeado (sem "roteiro abortou").
19. O ramo de erro de `aplicarImport` é honesto: a Decisão 10 aplicada em `RECUSAS_DA_RPC`, e o `import_falhou`
    grava o caminho do backup sob a chave que a 12ª checagem lê quando ele fica.
20. Administração › Filiais mostra, inclui e remove apelidos: nome próprio fixo, colisão recusada com a filial dona,
    aviso da filial sem apelido, trilha em `eventos_admin` (verbos em `auditoria.ts` e no comentário da coluna),
    `exigirAdmin` + Zod + RLS, e o teste de componente grau 1.
21. `criarFilial` e `atualizarFilial` recusam o nome que colide com outra filial ou com um apelido dela.
22. **O smoke do import passou no ENSAIO** — passe 1 (`sede`, nome próprio + apelido cadastrado pela tela nova, N
    ativos conferidos no banco) e passe 2 (lançamento vinculado + pendência → segundo "Substituir tudo", com outro
    arquivo, passa, saldo igual, pendência no backup) —, com a saída real no relatório. **É a prova que conta.** Ou, se
    o classificador barrou, o script pronto e o comando no roteiro do Johnny, com a pendência declarada.
23. O passe 3 rodou: preview sem `site_divergente` por apelido nas cinco filiais WAP do ensaio.
24. As doze checagens do ensaio têm os mesmos totais antes e depois do smoke (nunca amostra); nenhum backup órfão;
    nenhum conflito novo; a persona admin terminou desativada.
25. O smoke só lê `NEXT_PUBLIC_*` e a chave de serviço, e a guarda dele recusa o ref de produção e um ref inventado —
    provado por teste unitário da guarda, nunca apontando o smoke para produção.
26. Os catálogos de segurança acolhem por nome, no mesmo commit, as tabelas, policies e funções novas;
    `db:types:diff` verde em todo push; `npm run db:test:mutations` verde com as mutações novas e o teto novo com o
    motivo.
27. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; `npm run db:lock` no commit de cada
    migration.
28. `0139` e `0140` aplicadas **no ensaio primeiro**, depois em produção, por você (decisão iv), com a verificação
    pós-apply do runbook, o `prosrc` normalizado das funções igual ao corpo do arquivo, o CI verde ANTES de cada
    apply, e as contagens de acervo antes = depois —
    ou a `0140` presa no classificador, com o handoff em `scratchpad/`, o bloqueio registrado e o critério 16
    garantindo que o código convive com a RPC antiga.
29. `database.ts` regenerado de produção — ou, para a `0140` presa, o hand-fix datado com a pendência.
30. A ajuda do import, as emendas da spec (§5 e §10.2), a linha da `ARQUITETURA.md` §10, o cabeçalho de
    `limites.ts` e as regras novas da `MATRIZ-REGRAS.md` estão escritos.
31. Versão `1.61.0` no `package.json`, entrada no `CHANGELOG.md`, entrada no `registry.ts` em linguagem de operador
    (2 a 6 mudanças), tag anotada `v1.61.0` publicada.
32. A ORDEM DE ROLLBACK está no cabeçalho das duas migrations e foi ensaiada **só no ensaio**, num único `execute_sql`
    com `begin … rollback`, conferindo `pg_get_functiondef` e a existência das tabelas antes e depois — ou, se o
    classificador barrou o ensaio do rollback (reemitir o corpo da `0131` também contém `delete from public.ativos`),
    o bloqueio registrado e o SQL de rollback pronto no handoff.
33. PR mergeado com `verificar` e `banco-sem-docker` verdes; deploy publicado; smoke pós-deploy contra PRODUÇÃO verde
    — ou vermelho só por achado real novo, relatado.
34. `docs/RELATORIO-F56.md` com evidências reais, o roteiro do Johnny no topo, as divergências contra a ficha
    explicadas e a seção *"o que este relatório NÃO prova"*.
35. Nada fora do escopo tocado; nenhum dado real nem valor de credencial em teste, fixture, evidência, smoke ou log —
    com uma varredura final provando.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes de cada push. Depois de
cada migration: `npm run db:lock` — e o `banco-sem-docker` do PR roda os roteiros **inteiros**, não só os que você
tocou: a regra da F17 manda rodar TODOS ao mexer em função, e esta fase recria três funções da cadeia do import. Você
lê a saída com `gh run view --log-failed` em vez de supor. Leia a falha, corrija a **causa raiz** e repita até passar.
**Não afrouxe trava, não acrescente exceção para ficar verde, não troque asserção por afirmação, não desligue
mutação porque deu trabalho, não trunque célula para caber no teto, não suba a linha de base do alarme, e não rode o
smoke do import — nem um preview — contra produção.** Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a
troca.

Provas obrigatórias, cada uma com a saída real em `docs/f56-evidencias/` — e **sem um dado real sequer**: reveja cada
arquivo antes do commit.
- **Sabotagem A — as travas vermelhas**: cada uma, no começo da sua frente, acusando pelo nome. No fim, com tudo
  verde: reintroduza um nome de filial num módulo de `lib/import/`, um `Exclude` com valor fora da união pelo
  utilitário estrito, e um teto maior sem refazer a conta — as três têm de ficar vermelhas.
- **Sabotagem B — o vocabulário**: tire um apelido histórico da fixture da guarda (nunca da migration aplicada) → a
  guarda acusa; tente os três caminhos de ambiguidade (criar filial, renomear, cadastrar apelido) → recusados; mande
  um vocabulário forjado junto do pedido → o servidor ignora.
- **Sabotagem C — os tetos**: CSV com o teto de linhas + 1 → recusado com a mensagem do leitor; CSV com um `;` a mais
  → `linha_desalinhada`; o mesmo arquivo com colunas vazias à direita e `\n` final → aceito; a tabela da medição 1
  (os cinco corpos, em bytes, serializador real, os dois perfis) e a conta que ela produziu.
- **Sabotagem D — a FK**: as mutações novas, cada uma acusada pelo cenário nomeado; e a tabela de saldo de itens e
  `saldo_colaborador` antes × depois.
- **O smoke** (critérios 22 a 25): a saída dos três passes, o teste da guarda com as duas recusas, e a tabela das doze
  checagens do ensaio antes × depois (só totais).
- **O `.xlsx`** — a medição 2, com memória e tempo.
- **`npm run build` limpo**, colado por inteiro; **`npm run db:test:mutations`** com a tabela final do injetor; o
  resumo do `banco-sem-docker` (roteiros e asserções, antes × depois).
- **O apply** — a verificação pós-apply das duas migrations nos dois bancos, o `prosrc` normalizado contra o corpo do
  arquivo, a sonda de paridade ensaio × produção, e o ensaio de rollback.
- **O smoke pós-deploy**, mirando produção, com a ressalva escrita do que ele não exercita (o import).

## O apply — leia isto antes de tentar
**A `0139` é caminho A** — tabelas, policies, seed, um comentário; nenhuma exclusão. **A `0140` é caminho B pelo
runbook** — recria a função que contém `delete from public.ativos` —, e **você a aplica** (decisão iv), no molde da
F55: `apply_migration` do MCP (`docs/f55-evidencias/C2-apply-0138.txt`). **Nenhuma migration toca banco real antes
de o CI tê-la rodado:** migration aplicada não se corrige mais no lugar (`RUNBOOK-BANCO.md`, *"A trava de hash"*), e
o `banco-sem-docker` é o *"rode TODOS os roteiros"* do runbook — o único lugar onde o critério da filial atual e o
ativo transferido do fato 29 estão provados. A ordem, sem atalho:
1. **Confirme o estado antes de qualquer DDL**, nos dois bancos: a `0138` é a última aplicada; as filiais do seed
   existem pelos slugs; as tabelas novas não existem; os corpos vigentes são os que o fato 28 e o fato 33 dizem (as
   duas auxiliares da `0131`, a orquestradora da `0132`). Divergiu? **Pare no sentido do runbook** (abaixo) e
   registre.
2. **`0139` escrita, `db:lock`, `database.ts` com as tabelas (hand-fix datado neste primeiro momento — fato 13), push,
   e o `banco-sem-docker` VERDE.** Só então, **no ensaio**; verificação pós-apply: as tabelas, a RLS ligada, as
   policies, os grants, as contagens do seed (13/5/17/12/7), o `get_advisors(security)` sem achado novo, `notify
   pgrst, 'reload schema';`. É o que a Frente E e o smoke precisam.
3. **`0140`: o mesmo — CI verde primeiro, depois o ensaio.** Depois do apply, a prova de que não houve erro de
   transcrição (com o MCP, o SQL passa por você — fato 31): o `prosrc` normalizado de cada uma das três funções
   (`md5(regexp_replace(prosrc,'\s+',' ','g'))`) igual ao corpo entre os `$$` do arquivo, normalizado igual e
   extraído por `scripts/db/corpo-vigente.mjs` — **nunca o `pg_get_functiondef` inteiro contra o arquivo, que não bate
   nunca** (o Postgres reescreve o cabeçalho); qualquer diferença no `prosrc`, reverta. Assinaturas idênticas, nenhum
   overload, as auxiliares fechadas nos quatro papéis, a orquestradora com EXECUTE só para `authenticated`, e a trava
   da F51. **Se o classificador barrar, não reformule e não tente por outro caminho**: o SQL de handoff vai para
   `scratchpad/`, com o bloco de conferência do caminho B, e o apply da `0140` — ensaio e produção — vai para o
   roteiro do Johnny; o passe 2 do smoke vira pendência; o resto da fase segue.
4. **Produção**, depois do ensaio e do smoke: a `0139` **antes do merge** — o código novo lê as tabelas dela, e sem elas
   a tela do import quebra. Sem a `0139` em produção **não mergeie**: o PR fica pronto e aberto, com o bloqueio no topo
   do relatório — é a única ponta aberta que esta fase admite. A `0140` em seguida (a regra do fato 33 faz as duas
   ordens de deploy serem seguras). Em cada uma: contagens de acervo antes = depois, o `get_advisors(security)` sem
   achado novo, a mesma prova do `prosrc` do passo 3, e a sonda de paridade ensaio × produção do runbook fechando.
5. `npm run db:types` (de produção, fato 43), substituindo o hand-fix; o `db:types:diff` roda no CI.
**Se o CI achar defeito numa migration que já foi a um banco real**, a correção é migration NOVA (a seguinte da
fila), declarada no relatório — nunca editar a aplicada.
**"Pare", aqui, não significa esperar por humano** — não há humano. Significa: não siga para o passo seguinte, reverta
na ordem inversa o que foi aplicado, capture a evidência da divergência e continue com o que não depende do banco.
Abortar sem reverter e sem registrar é a única saída proibida.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere
confirmação em nenhuma hipótese. Régua, nesta ordem: (1) uma medição sua contra o disco de hoje; (2) as quatro
decisões do Johnny, que estendem a ficha; (3) a ficha da F56 no §5 do plano; (4) este prompt, no que ele detalha — e
onde ele diverge da ficha, a divergência está declarada aqui e vai para o relatório (o `docs/README.md` manda: onde a
ordem e a ficha divergem sem declaração, vale a ficha); (5) as convenções do repositório (`CLAUDE.md`, `AGENTS.md`,
`RUNBOOK-BANCO.md`, código existente); (6) a opção mais simples e reversível. Decisão não-óbvia vai para
`docs/DECISOES.md` com data, contexto, escolha e motivo.

**As treze decisões que esta fase precisa tomar por escrito:**
1. **As tabelas do vocabulário** (fatos 7, 10, 13): uma ou duas; colunas e chaves; a coluna da forma de exibição e o
   que garante uma por valor; a chave normalizada em SQL que espelha `normalizarTexto` (pela medição 4, sem
   `unaccent`, proibido na casa) e a guarda TS↔SQL dela; e o que a RLS deixa escrever em cada uma.
2. **O nome próprio e a ambiguidade** (fato 14): o que conta como "nome da filial" (o nome; o slug?); se filial inativa
   entra no vocabulário; e a forma da recusa no banco para cada caminho (criar, renomear, cadastrar apelido — e
   reativar, se a inativa sair).
3. **O transporte do vocabulário** (fato 6): a forma serializável, a query só-servidor, o que cada action lê, o que
   `aplicarImport` confere, e o que desce para os três consumidores de cliente.
4. **O utilitário estrito de exclusão** (fato 17): nome, lugar, e se a proibição do `Exclude` cru vale só no import ou
   para os enums de domínio em todo `src/`.
5. **A regex numa fonte só** (fatos 18–19): as partes, a derivação das quatro cópias, e a forma exata de
   `patrimonio-sql.test.ts` sobre o corpo vigente.
6. **A conta dos tetos** (fatos 22–24): os números, a tabela da medição 1, onde mora o limite de corpo, a folga, o teto
   do arquivo e o de linhas que saem dela.
7. **O `.xlsx` descomprimido** (fato 25): conferir antes do `load`, ou registrar que o pior caso cabe — pela medição 2.
8. **A régua do desalinhamento** (fato 26): célula a mais × a menos, a largura útil, as linhas vazias, o `.xlsx`, e o
   tipo do card.
9. **O conserto da FK** (fatos 27–35): a ordem exata dentro da auxiliar, as chaves novas de `p_contagens`, o formato
   da versão 2 (os nomes das chaves próprias), e como o restaurador religa e recusa versão desconhecida.
10. **O ramo de erro** (fato 30): quais códigos entram em `RECUSAS_DA_RPC` pela régua "sei que não commitou", e as
    chaves do `import_falhou`.
11. **A forma do smoke** (fatos 36–39): script Node que reproduz o caminho da action × o app local dirigido pelo
    Playwright contra o ensaio (o molde de `capturar.mjs`); a persona e a senha dela; a variação do arquivo entre
    execuções e entre passes; os verbos da trilha dela; como nascem o lançamento vinculado e a pendência do passe 2
    pelos caminhos do sistema; e o que fica no ensaio depois (a `sede` como fixture permanente, documentada no README
    do smoke).
12. **A trava `sem-wapismo`** (fato 40): literais × comentários, a regra de caixa, a allowlist nominal (testes, ajuda,
    placeholders, o histórico do `registry.ts`), o falso positivo `celulasDaMatriz`, os nomes de layout (`'matriz'`,
    `'cd'` — renomear o IDENTIFICADOR não muda o layout, que são as colunas), e se os termos que viraram dado (os
    apelidos, `'rt wap'`, `'posse wap'`, os prefixos) também são varridos em `lib/import/**`.
13. **A tela de apelidos** (fato 14): no `FilialDialog` ou num diálogo próprio; os nomes dos verbos da trilha; o teto de
    tamanho do apelido; o texto do aviso.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** e registre. Bloqueio real — MCP da Supabase
ausente, ensaio fora do ar, classificador barrando a `0140`, a persona ou a execução do import no ensaio, cota de
Actions esgotada: contorne se for seguro; senão, **entregue o resto e registre a pendência com o que falta para
resolvê-la**. **Não invente caminho de apply alternativo, não force o classificador, não desative a proteção da
`main`, não rode `db:seed` nem `db:reset`, não rode import em produção, não substitua o acervo de filial que já existe
no ensaio, não leia `SMOKE_*` no smoke do import, e não ponha um nome, patrimônio, e-mail, senha ou valor de credencial
real em evidência, teste, fixture ou log de prova.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que esteja no relatório. Foi
assim que a F46 trocou "aplicar duas vezes" por prova de determinismo, a F53 mediu que uma função não precisava ser
recriada e a F55 achou dez divergências onde a ordem previa nove. **Aqui já há treze divergências medidas de saída:**
as migrations são a `0139` e a `0140`, e a versão a `1.61.0`, não a `0136`; a sexta filial já existe em produção; a
identidade da unidade é o `filial_id`, não o "nome canônico" da ficha; o `limites.ts` já existe; o limite de corpo em
produção é 4,5 MB, não 8, e o arquivo de 5 MB já passa dele; os números que conversam são pelo menos seis, e os corpos
são cinco; o 413 não deixa backup, e ninguém o vê; `PARTES_RE` não existe; a regex do SQL está morta; o
`Exclude<…, 'outro'>` saiu em 30/08 e volta um só; o `.xlsx` perde em silêncio o valor à direita do cabeçalho; o seed
de apelidos tem 13 linhas, não 18; e o smoke do import nunca existiu. Declare também, no relatório, as que este prompt
cria por decisão do Johnny: o conserto da FK (i), que a ficha não tinha — e pelos cinco caminhos, não os dois do
backlog; Tipo, Situação e prefixo no banco (ii), além da `unidades_apelidos` que ela lista; a tela que edita apelidos
(iii), além do aviso que ela pede; o apply da `0140` por você (iv), contra a letra do runbook; duas migrations em vez
de uma; e os passes 2 e 3 do smoke.

# Git e segurança
Branch `f56-import-sem-wapismo-e-sem-bomba`, commits pequenos e frequentes, mensagens em pt-BR no padrão conventional
(`fix(f56): …`, `feat(f56): …`, `test(f56): …`, `docs(f56): …`). Commite também esta ordem
(`docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md`) na branch, num commit de documentação — o primeiro
commit de CÓDIGO é o da Frente A. PR com `gh pr create`; merge só com os dois checks verdes; correção de código depois
do merge vai por PR novo. Agrupe os pushes — cada um custa uns seis minutos de CI numa cota que já está no limite
(fato 43). **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é
seu, commitar `.env*`, `scratchpad/`, o `.xlsx` da medição 2 ou valor de credencial, editar migration aplicada, mexer
na proteção da `main`, escrever em produção fora do apply da `0139` e da `0140`, ou apontar o smoke do import para
qualquer coisa que não seja o ensaio.

# Como trabalhar
Explore com subagentes paralelos — e **cada um volta só com resumo e NÚMEROS MEDIDOS, nunca com dado real de
produção** (nome, patrimônio, e-mail): (a) **o vocabulário** — cada consumidor com arquivo:linha, se roda no cliente
ou no servidor, e a cadeia da página até o motor; (b) **os tetos** — as medições 1 e 2, a doc local do Next 16 sobre
`bodySizeLimit` e a serialização de Server Action, a doc do React 19 sobre prop serializável, e a doc da Vercel sobre
o limite de corpo; (c) **a FK** — os cinco caminhos, a cadeia `import_*` da `0131`/`0132`, os leitores dos elos, de
`pendencias_item` e do ponteiro de substituto, as contagens, e o trio backup / restaurador / roteiro; (d) **os
catálogos** — que roteiros e testes enumeram tabela, policy, função, verbo e mutação por nome, e o que uma tabela, um
verbo e uma função recriada exigem de cada um; (e) **o smoke** — o molde de `capturar.mjs`, as guardas de
`env-guard.ts`, a cascata de `SMOKE_*` que ele NÃO pode copiar, os perfis do ensaio, e como o sistema cria um
lançamento vinculado e uma pendência de item pelos próprios caminhos.

Escreva `docs/PLAN-F56.md` antes de implementar, com as contagens reais, o desenho das tabelas e do tipo do
vocabulário, a tabela da conta dos tetos, a ordem do conserto da FK, o formato da versão 2 do backup, o desenho do
smoke, as treze decisões já tomadas e a ORDEM DE ROLLBACK das duas migrations. Implemente frente a frente, na ordem A →
H, com `lint`/`test`/`tsc` verdes entre uma e outra. A costura que decide o fim: cada migration passa pelo CI antes de
qualquer banco real; a `0139` no ensaio antes da Frente E e do smoke; a `0140` no ensaio antes do passe 2; as duas em
produção antes do merge (a `0139` obrigatoriamente); o merge antes do deploy e do smoke pós-deploy.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F56.md` e os 35 critérios, com
estas perguntas: a filial fora do vocabulário ainda gera um `site_divergente` por linha em algum caminho — preview,
correção, "baixar corrigido"? sobrou palavra da WAP em `lib/import/**` ou nos componentes do import, fora da
allowlist? o servidor julga em algum ponto com o vocabulário que veio do cliente? dá para deixar o vocabulário ambíguo
criando filial, renomeando ou cadastrando apelido? o seed da `0139` tem exatamente 13/5/17/12/7, e a guarda pega um a
menos? os Selects e o CSV corrigido perderam caixa ou acento? o nome próprio vale sem linha no banco, inclusive para a
Filial de Teste e depois de um rename? algum dos cinco corpos passa de 4,5 MB no pior caso que o motor aceita? um CSV
legítimo com colunas vazias à direita ou `\n` final passou a ser recusado? a `0140` mudou algum saldo de item ou
`saldo_colaborador` fora do acervo substituído, ou tocou pendência de ativo de outra filial? algum dos cinco caminhos
de FK ficou sem tratamento — e o CI enxergaria, com a chave adiada? `delete from public.ativos` aparece em mais de uma
função da cadeia do import? a RPC nova aceita `p_contagens` sem as chaves novas? o backup versão 2 leva tudo o que a
RPC muda, sob chaves próprias, e o restaurador devolve e recusa versão desconhecida? o `import_falhou` ainda chama de
"descartado" um backup que ficou? o smoke lê `SMOKE_*`, consegue rodar contra produção ou contra uma filial que ele
não criou? a senha da persona apareceu em algum lugar, e ela terminou desativada? as doze checagens do ensaio mudaram?
algum dado real entrou em teste, fixture, evidência ou log? algum arquivo fora do escopo foi tocado? **Aponte apenas
lacunas de correção ou de requisito declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F56.md`, em pt-BR, no padrão dos relatórios F45→F55, **com o roteiro do Johnny no TOPO** — o que ficou
com ele, passo a passo, e por quê (no mínimo: o apply da `0140` e o smoke, se o classificador os barrou). Depois: o que
mudou por arquivo e por quê; **os números MEDIDOS** lado a lado com o que a ficha previa (as filiais; os consumidores do
vocabulário; os 13/5/17/12/7; a tabela dos cinco corpos e da conta dos tetos; a FK por filial e por caminho, antes e
depois, no ensaio; mutações, roteiros e asserções antes/depois), e **cada divergência explicada** — a começar pelas
treze já conhecidas; as **treze decisões** com o custo que decidiu cada uma; as **sabotagens** com saída real; a saída
do smoke; os 35 critérios autoverificados; e a seção **"o que este relatório NÃO prova"** — no mínimo: que o smoke
prova uma unidade fictícia no ensaio, não uma planilha real da WAP; que o limite de 4,5 MB da Vercel não se reproduz no
`next dev` — o teto está provado pela conta, não por um 413 observado; que o conserto da FK foi provado no CI e em
`sede`, nunca na Matriz — não há import em produção nesta fase, e o primeiro reimport real será a prova que falta; que
as outras quatro RPCs destrutivas continuam com os mesmos caminhos de FK (com as contagens); que o vocabulário de Tipo e
Situação só muda por migration; e o que ficou sem prova por causa do classificador, do MCP ou do ensaio. Pendências e
**backlog nomeado**: para a **F62/F64** (as tabelas novas precisam de `empresa_id`, e a lista de doze da F64 não as tem
— o plano precisa de emenda); para a **F65** (a unicidade do apelido e do nome passa a ser por empresa); para a
**F73** (o onboarding usa a tela de apelidos, e o vocabulário de Tipo e Situação ainda não tem tela); e **a classe das
quatro RPCs destrutivas**. **Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final
com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de código e de migration, mensagens de erro, `comment on` e commits em
**pt-BR**. Identificadores de domínio em português sem acento (`unidades_apelidos`, `conferirTetos`,
`linha_desalinhada`, `filial_fora_do_vocabulario`); utilitários e infra em inglês. As mudanças do `registry.ts` em
LINGUAGEM DE OPERADOR — há teste que recusa termos de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~15 minutos)

Este arquivo já está em `docs/prompts/F56-import-sem-wapismo-e-sem-bomba-ultracode.md`, **sem commit** — é assim que
as fases anteriores começaram: o agente o commita na branch da fase. O prompt cita os 43 fatos do cabeçalho pelo
número, então ele precisa estar lá quando você colar o bloco.

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. Confirme onde a F55 parou: 1.60.0 no package.json, última migration 0138.
type package.json | findstr version
dir supabase\migrations | findstr 013

# 3. Feche o alarme do ensaio (item 0 do roteiro da F55). O ensaio voltou — conferi hoje às 08:26 —,
#    mas a issue #41 continua aberta, e esta fase vai escrever no ensaio.
& "C:\Program Files\GitHub CLI\gh.exe" workflow run saude.yml -f alvo=ensaio -f partes=b
#    espere o run terminar e confira que a #41 fechou sozinha:
& "C:\Program Files\GitHub CLI\gh.exe" issue view 41 --json state

# 4. O .env.local continua apontando para o ENSAIO? (mostra só o ref e se a chave existe — nunca o valor)
Get-Content .env.local | Where-Object { $_ -match '^(NEXT_PUBLIC_SUPABASE_URL|SUPABASE_SERVICE_ROLE_KEY)=' } |
  ForEach-Object { $n,$v = $_ -split '=',2; if ($v -match 'https://([a-z0-9]+)\.') { "$n -> $($matches[1])" } elseif ($v) { "$n -> preenchida" } else { "$n -> VAZIA" } }
#    esperado: a URL no ref do ensaio (sgmvldiizsrjbxzzpmhh) e a chave preenchida

# 5. O gh e a versão do Claude Code (o modo auto exige 2.1.83+; esta máquina está na 2.1.222).
& "C:\Program Files\GitHub CLI\gh.exe" auth status
claude --version
```

Se a #41 **não** fechar, o ensaio tem algo fora da linha de base: abra o `docs/RUNBOOK-ALARME.md` antes de rodar a
fase — o smoke dela exige as doze checagens do ensaio iguais antes e depois, e partir de um ensaio desconhecido
contamina a prova.

**Três coisas que só você pode conferir antes de colar:**

1. **O MCP da Supabase conectado** — é por ele que a `0139` e a `0140` vão ao ensaio e a produção. Sem ele, a fase
   termina com o PR pronto e **aberto** (o código novo lê as tabelas da `0139`, e mergear sem elas quebra a tela do
   import). Conecte também o **Context7** (a doc do Next 16 e do React 19) e, se puder, o da **Vercel** (a doc do
   limite de corpo — o agente também a acha na web).
2. **A cota de Actions** — em github.com/settings/billing. O relatório da F55 projetou 2.579 a 2.953 min/mês contra os
   2.000 do Free, e esta fase faz vários pushes de CI. Se a cota acabar no meio, o PR não mergeia.
3. **Saiba o que a run vai criar no ENSAIO**: a persona `seed.admin@wap.ind.br` (com senha aleatória que ninguém vê, e
   desativada no fim), a filial `sede` (que fica como fixture permanente do smoke) e os ativos fictícios dela. Em
   produção, só as duas migrations — o import nunca roda lá.

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` e o `gh` não estão negados — a
fase abre PR, mergeia e publica tag) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).

### Rodar

```powershell
claude --model opus --permission-mode auto -n f56
# cole o bloco do prompt inteiro e deixe rodando
```

**Interativo, e de preferência com você por perto em dois momentos.** Três ações desta fase podem ser barradas pelo
classificador do modo `auto`: o apply da `0140` (ela recria a função que contém `delete from public.ativos` — na
v1.59.1 ele NÃO barrou, mas não há garantia), a criação da persona admin no ensaio e a execução do import no ensaio,
contra a filial vazia `sede`. Um bloqueio isolado **não** abre pedido de aprovação — o modo `auto` só volta a
perguntar depois de 3 bloqueios seguidos ou 20 no total, e o prompt manda não insistir. O bloqueado vira pendência
escrita no topo do relatório, com o comando pronto para você rodar depois. Se você estiver acompanhando e quiser que
aconteça na própria run, diga na sessão, com todas as letras, que autoriza **aquela** ação (por exemplo: *"autorizo
aplicar a 0140 no ensaio e em produção"*); se o classificador barrar mesmo assim, fica para o roteiro. **Autorize só
o que for isso** — qualquer coisa que aponte import para produção é recusa.

**No `-p`, o bloqueado é pulado e a run segue** — é a alternativa se você não puder acompanhar (o prompt vai por
stdin, porque o bloco passa do limite de linha de comando do Windows):

```powershell
# alternativa desatendida: salve só o bloco do prompt em prompt-f56.txt (fora do repositório) e rode
$utf8 = New-Object System.Text.UTF8Encoding $false   # UTF-8 SEM BOM: o BOM entraria antes do "ultracode"
$OutputEncoding = $utf8; [Console]::OutputEncoding = $utf8
Get-Content ..\prompt-f56.txt -Raw -Encoding UTF8 |
  claude -p --model opus --permission-mode auto --output-format json |
  Set-Content -Encoding UTF8 ..\run-f56.json
# guarde o session_id do JSON: sessão -p só se retoma por ele (claude --resume <session_id>)
```

Modo `auto` é o certo: a fase roda `npm ci`, `npm run db:lock`, `gh pr create`, `gh pr merge`, tag e push, apply por
MCP, um Next local contra o ensaio e o Playwright — nada disso passa numa allowlist estreita. O que ela **não** faz
(import em produção, push forçado, editar migration aplicada, mexer na proteção da `main`) está no escopo negativo do
prompt.

**Não use `--worktree` nesta fase:** o smoke precisa do `.env.local` da pasta principal, e uma worktree não tem o
`.env.local` (é arquivo fora do git).

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit limpos; a trava sem-wapismo verde; as migrations 0139 e 0140 existem com db:lock rodado; a 0139 esta aplicada em ensaio e producao, ou o bloqueio dela esta registrado no topo do RELATORIO-F56.md; o smoke do import passou no ensaio contra a filial sede, ou o bloqueio do classificador esta registrado no RELATORIO-F56.md com o comando para o Johnny; o PR esta mergeado com verificar e banco-sem-docker verdes, ou esta aberto com o bloqueio da 0139 em producao no topo do RELATORIO-F56.md; e docs/RELATORIO-F56.md tem o roteiro do Johnny no topo
```

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **O primeiro commit de código.** Tem de ser só a correção imediata (`filial_fora_do_vocabulario` + o aviso). Se ele
   já for a refatoração do vocabulário, a fase perdeu o estado de repouso.
2. **As travas vermelhas.** Cada frente começa provando a sua trava vermelha, em evidência. A `sem-wapismo` tem de
   acusar `tipos.ts` e `deparas.ts`; a de limites tem de acusar a conta dos cinco corpos contra os 4,5 MB. Trava que
   nasce verde não provou nada.
3. **A `0139`.** No diff, o seed tem de ter exatamente 13 apelidos, 5 categorias, 17 estados, 12 formas de exibição
   ("Saída", com acento) e 7 prefixos — e o comentário de `eventos_admin.acao` tem de ganhar os verbos da tela de
   apelidos.
4. **A `0140`.** É onde o classificador pode barrar. Depois, confira no relatório o md5 dos corpos contra o arquivo e
   a tabela de saldo de itens antes × depois: tem de ser idêntica.
5. **O smoke.** Três passes, a tabela das doze checagens do ensaio antes × depois, e a persona desativada no fim. Se
   aparecer patrimônio, nome, e-mail ou senha em qualquer evidência, é dado sensível entrando no repositório.

### Ao voltar

1. **Execute o roteiro que está no topo do relatório.** O mais provável, se o classificador barrou alguma coisa: rodar
   a `0140` no SQL Editor — **ensaio primeiro**, depois produção — com o SQL de handoff do `scratchpad/` e o bloco de
   conferência dele; ou rodar o comando do smoke que ficou escrito lá.
2. Leia as **treze atas** em `docs/DECISOES.md`. A **1** (as tabelas) e a **2** (a ambiguidade) são as que a F62/F64 vai
   herdar; a **9** (a FK) é a que mexe na função que apaga acervo; a **6** (os tetos) decide o maior arquivo que você
   consegue importar — e ele vai ficar abaixo dos 5 MB de hoje, porque a Vercel corta em 4,5.
3. `git diff main...f56-import-sem-wapismo-e-sem-bomba -- supabase/migrations/ supabase/migrations.lock.json` deve
   mostrar só migrations NOVAS — a `0139`, a `0140` e, se o relatório declarar, uma corretiva — e a trava de hash.
   Qualquer migration antiga tocada = a fase quebrou a regra mais dura do repositório.
4. Abra **Administração › Filiais** em produção só para OLHAR: cada filial mostra os apelidos dela; a Filial de Teste
   mostra só o próprio nome, com o aviso. As recusas você testa **no ensaio** (`npm run dev` com o `.env.local` de
   hoje): cadastre "Serra Park" na Matriz — tem de ser recusado, porque é da Serra —, e tente criar uma filial chamada
   "Serra Park" — também. Em produção, um teste desses que passasse criaria filial ou apelido de verdade.
5. Quer ver o import com os próprios olhos? **No ensaio** — `npm run dev` com o `.env.local` de hoje — abra
   Administração › Importar e escolha a `sede`. Em produção, não aplique nada: o primeiro reimport real da Matriz, de
   Linhares, de Eusébio ou da Filial de Teste é a prova que esta fase não pôde fazer.
6. Rode você mesmo `npm run test` e `npm run build` uma vez.
7. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, peça um prompt novo com o aprendizado e rode
   em sessão limpa. A reversão, nesta ordem: `git revert` + deploy **primeiro** (o código novo lê as tabelas da
   `0139`); depois o rollback da `0140` (reemitir os corpos da `0131`/`0132` — se o classificador barrar, é o SQL Editor);
   por último o da `0139` (derrubar as tabelas, que nada mais lê). Os backups de import gravados na versão 2 ficam no
   bucket, inofensivos — mas **só se restauram com o `restaurar.mjs` da tag `v1.61.0`**: o de antes da fase não
   conhece a versão 2 e restauraria pela metade, sem avisar.

---

## Suposições que fiz

1. **A F56 vem agora e a F55 está fechada**: `package.json` em `1.60.0`, última migration `0138`, `main` em `ef8a1e4`,
   árvore limpa. Por isso as migrations são a **`0139`** e a **`0140`**, e a versão a **`1.61.0`** — e o prompt manda
   medir antes, não confiar no número escrito.
2. **Duas migrations, não uma.** A do vocabulário é caminho A e sai sozinha; a da FK recria a função que apaga acervo e
   ainda pode bater no classificador. Separadas, a primeira nunca espera a segunda, e o código da FK é obrigado a
   conviver com a RPC antiga.
3. **Os 7 prefixos de patrimônio também vão para o banco.** Li assim a sua decisão (ii) — *"nenhuma palavra da WAP no
   código do import"* —, e o próprio código chama a lista de *"prefixos oficiais da WAP"*. A ficha só pedia a trava de
   paridade. Se você prefere os prefixos no código, com a trava, é uma linha no prompt.
4. **O seed de apelidos tem 13 linhas, não 18.** Cinco dos 18 apelidos de hoje são o próprio nome da filial
   (`matriz`, `cd afonso pena`, `linhares`, `serra`, `eusebio`), e o nome próprio vale sempre sem linha no banco — a
   guarda prova 13 + 5 = 18.
5. **"Desvincular" é pôr o elo em nulo, e as pendências de item do acervo substituído são APAGADAS** (com backup). Medi
   que `saldo_colaborador` não lê o vínculo e que `pendencias_item.ativo_id` é NOT NULL — não há como deixar a pendência
   de pé sem o ativo; é o que o reset e a mesa de conflitos já fazem com elas. A revisão achou mais dois caminhos da
   mesma bomba (o lançamento que resolveu uma pendência e o substituto que foi para outra filial) — os dois estão em
   zero hoje, e entram no conserto porque são a mesma chave estourando no mesmo lugar.
6. **O teto de arquivo vai descer abaixo de 5 MB.** A Vercel corta pedido e resposta em 4,5 MB, e o arquivo de 5 MB que
   a tela aceita hoje já não passa em produção. Os inventários reais são de dezenas a centenas de KB, então nenhum
   import real é afetado — mas a mensagem da tela muda.
7. **O smoke roda no ENSAIO, com uma persona admin fictícia criada lá** (`seed.admin@wap.ind.br`, sem rodar o seed, com
   senha aleatória e desativada no fim), e a filial `sede` **fica** no ensaio como fixture do smoke, documentada. Medi
   que o ensaio não tem admin fictício hoje, e que o único admin ativo de lá não é persona do seed.
8. **Nenhum import roda em produção nesta fase.** O conserto da FK é provado no CI e na `sede` do ensaio; o primeiro
   reimport real de uma das quatro filiais afetadas é a prova final, e está dito assim no relatório.
9. **O vocabulário de Tipo e Situação não ganha tela nesta fase** — a sua decisão (iii) foi sobre os apelidos de
   unidade. Mudar Tipo ou Situação continua sendo migration até o onboarding da F73.
10. **O pré-voo fecha a issue #41** (o item 0 do roteiro da F55) antes da fase, porque a F56 escreve no ensaio e o smoke
    compara as doze checagens de lá antes e depois.
11. **Esta ordem passou por duas revisões adversariais em contexto fresco nesta conversa**, contra a ficha, a F55 e o
    repositório: na primeira, 30 achados (2 altos, 16 médios); na segunda, sobre o texto já corrigido, 17 (nenhum alto,
    5 médios) — todos incorporados. Os que mais mudaram o texto: o limite real de
    4,5 MB da Vercel (a conta inteira dos tetos estava contra os 8 MB que não valem em produção); o quinto caminho de FK
    (`lancamentos_item.pendencia_item_id`), que teria feito o conserto estourar em outra chave; o critério da filial
    ATUAL do ativo (senão um import da Matriz apagaria pendência de Eusébio); a regra "chave ausente vale 0" das
    contagens; a orquestradora que também precisa ser recriada; o `unaccent` que a casa proíbe; as formas de exibição
    com acento; a cascata `SMOKE_*` que faria o smoke novo mirar produção como admin; e, na segunda, a prova de
    transcrição pelo `prosrc` (o `pg_get_functiondef` inteiro nunca bate com o arquivo) e o CI verde antes de qualquer
    migration ir a banco real.
