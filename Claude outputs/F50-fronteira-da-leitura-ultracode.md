# F50 — A fronteira da leitura

*Ordem de serviço gerada em 08/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco B.*

**Por que ela existe.** A F49 fechou as duas fronteiras do servidor e as travou por teste. Esta fase
vai atrás de uma classe pior: **os tripwires que já existem e já estão furados**. Um tripwire que
envelheceu é mais perigoso do que nenhum — ele devolve verde de um teste que parou de olhar para a
superfície inteira, e quem lê o verde acha que a pergunta foi feita.

O caso está documentado no próprio repositório: a F39 pôs `queries/tipos-item.ts` na superfície do
visualizador (a função aceita client resolvido e as **duas** páginas de relatório a chamam com
`acesso.client`, que para o viewer é o **service_role**) e ninguém declarou o arquivo no
`fronteira-viewer.test.ts`. O tripwire continuou verde por seis fases. E ele é **deny-list de três
nomes** — uma lista que, por construção, não cobre a tabela que ainda não nasceu. A virada cria
`empresas`.

A fase também cria, **trivialmente hoje**, os três lugares onde o recorte de tenant vai encostar: o
`podeLer` em `permissoes.ts`, o escopo do canal de tempo real, e a `pode_ler_arquivo_termo` no
Postgres. Nenhum deles muda comportamento com uma empresa só — é esse o ponto: **a fechadura entra
antes da porta existir**, e entra quando custa uma linha.

**O que esta fase NÃO é.** Não é recorte de filial (F57), não é `empresa_id` em lugar nenhum (F62+),
não é prefixo de tenant no caminho dos termos (F67 — e a decisão registrada aqui é que a leitura será
fechada **pelo join com `termos_gerados`**, não pelo caminho, justamente para não migrar arquivo com
dado pessoal). Não é a decomposição da RPC de import (F51) nem as guardas de escopo (F52).

**Uma mudança visível, uma só, e é decisão do Johnny:** o `ViewerAutoRefresh` para de refrescar a rota
mais cara do sistema numa aba oculta. Todo o resto é invisível para quem usa o sistema hoje.

---

**Catorze fatos de leitura do repositório, medidos em 08/09/2026, que a ficha do plano não tem.**

1. **O bloqueio de CI que derruba a fase no fim, se ninguém avisar.** `npm run db:types:diff` é passo
   do `banco-sem-docker` (`.github/workflows/ci.yml:293-296`), que é *required check*. Ele reprova
   quando **o banco tem o que o `database.ts` não tem** — e a `0129` cria uma função `public`. Os
   tipos de hoje já trazem `pode_escrever_arquivo_termo` (`src/lib/types/database.ts:1501`), então a
   irmã de leitura tem de aparecer lá também. **E `npm run db:types` gera de PRODUÇÃO**, pela
   Management API (`scripts/gen-types.ts:33-45`) — quer dizer: regenerar só funciona **depois** do
   apply em produção. As duas saídas honestas estão na Decisão 6. Sem tratar isso, a fase entrega
   tudo e morre no último check.
2. **`anotacoes` NÃO TEM `filial_id`.** As colunas são `id, ativo_id, texto, criado_por, created_at`
   (`0017_anotacoes.sql:6-13`). `movimentacoes` tem (`0003_tabelas.sql:76`) e `lancamentos_item` tem
   (`0015_lancamentos_item.sql:19`). A ficha manda acrescentar `filter:` **nas três** assinaturas —
   numa delas isso é **impossível hoje pela coluna**. É o achado que mais muda o desenho da frente do
   Realtime (Decisão 2).
3. **A regra da assinatura arrasta QUATRO arquivos para a superfície do viewer, não um.** Medi
   `client?: SupabaseClient<Database>` / `client: DbClient` em `src/lib/queries/**`: **44 ocorrências
   em 12 arquivos** — os 6 de `relatorios/` mais `conflitos.ts`, `filiais.ts`, `gerados.ts`,
   `import-logs.ts`, `pendencias-detalhe.ts` e `tipos-item.ts`. A superfície de hoje já declara
   `filiais.ts` e `gerados.ts` à mão. Entram pela regra derivada: **`tipos-item.ts`** (o que a ficha
   nomeia) **+ `conflitos.ts`, `import-logs.ts` e `pendencias-detalhe.ts`**. Se algum dos três for
   mesmo inalcançável pelo viewer, isso vira exceção **nominal com motivo medido** — nunca omissão.
4. **A allow-list nasce com 9 tabelas e 7 RPCs.** Medi na superfície de hoje mais `tipos-item.ts` —
   `.from(`: `anotacoes`, `ativos`, `filiais`, `itens`, `lancamentos_item`, `movimentacoes`,
   `relatorios_gerados`, `tipos_item`, `v_fila_pendencias` (a última é **VIEW**, e a lista branca tem
   de aceitar view sem virar exceção); `.rpc(`: `rel_estoque_asof`, `rel_frescor_itens`,
   `rel_mov_itens`, `rel_mov_por_mes`, `rel_por_motivo`, `rel_resumo`, `rel_saldo_itens`. A deny-list
   de hoje tem **três** nomes (`fronteira-viewer.test.ts:39-43`).
5. **`confinamento-viewer.test.ts` não é o irmão de leitura — ele é o tripwire dos LINKS** (F29, 261
   linhas): varre `href` literal na superfície que o viewer RENDERIZA. A superfície dele hoje são **6
   arquivos fixos + `readdirSync` de `components/relatorios/*.tsx` menos `acesso-form.tsx`**
   (linhas 26-43). **`SUPERFICIE_MINIMA` não existe** no arquivo (medido: zero ocorrências). O que a
   ficha pede é reescrever **`arquivosDaSuperficie()`**, derivando do grafo de imports — as sete
   asserções existentes, inclusive as três exceções registradas com guarda, continuam valendo e
   **não** são para reescrever.
6. **`comum.ts:19` engole o erro — e o arquivo já tem `server-only`** (a F49 pôs). Mas a varredura que
   a ficha manda congelar tem **quatro** infratores, não um: `relatorios/comum.ts:19`,
   `admin.ts:369`, `admin.ts:390` e `itens.ts:577`. **Três deles não são de relatório**, e a ficha só
   manda consertar o de relatório — os outros três entram na lista congelada, com o motivo de estarem
   lá.
7. **`filiais.slug` é `unique` global hoje** (`0003_tabelas.sql:11`). Quer dizer: o defeito do
   `maybeSingle()` silencioso **ainda não morde** — ele passa a morder quando a unicidade virar por
   empresa. A linha que o conserta custa uma linha hoje e evita um `notFound()` mudo em TODA rota de
   relatório depois. Escreva isso no relatório com essas palavras: é conserto **preventivo**, e o
   motivo é datado.
8. **`RealtimeRefresh` está montado em TRÊS telas, não só no relatório**:
   `relatorios/[filial]/page.tsx:170` (só no ramo `acesso.modo === 'operador'`), `itens/page.tsx:248`
   e `itens/historico/page.tsx:185`. E **o componente não recebe prop nenhuma hoje** — parametrizar o
   nome do canal por `chaveDoEscopo` obriga a decidir de onde o escopo vem no cliente, em três
   chamadas diferentes (Decisão 3).
9. **`ViewerAutoRefresh` é montado num lugar só** (o outro ramo do mesmo ternário, `page.tsx:170`) e
   **o projeto `componentes` do Vitest é `renderToStaticMarkup`, sem jsdom** (`vitest.config.mts`,
   comentário do projeto `componentes`). Efeito não roda ali. Logo, a trava do comportamento novo
   **não pode ser teste de render** — ou é função pura extraída e testada no projeto `puro`, ou é
   asserção de texto sobre o arquivo (Decisão 4).
10. **A trava do `podeLer` NÃO nasce verde — e o caso é bom demais para inventar.**
    `src/components/itens/lancar-item-campos.tsx:139` faz `podeCadastrar={filiais.length > 0}`, com o
    comentário ao lado dizendo, por escrito, *"lista vazia = cargo consulta, que não cria nada"* — é
    **cargo derivado do comprimento de uma lista**. Os dois vizinhos que fazem a mesma pergunta usam a
    forma certa: `podeCadastrar={papel !== 'consulta'}` (`passo-movimentacao.tsx:389` e
    `secao-contrapartida.tsx:251`). É exatamente o padrão que a trava desta fase existe para proibir,
    e ele está no repositório hoje, em um lugar, com o molde certo a dois arquivos de distância
    (Decisão 5).
11. **As outras 10 ocorrências de `filiais.length`/`filiais[0]` são ergonomia, não autorização**: filial
    única pré-selecionada (`nova-compra-form.tsx:362`), estado vazio (`:1199`,
    `lancar-item-campos.tsx:74`), layout de matriz (`itens-table.tsx:345,471`), default de select
    (`lancar-item-dialog.tsx:102`), contagem em texto (`admin/filiais/page.tsx:25`) e o
    `temRecorteFilial` de quatro páginas — que compara `filialIds.length < filiais.length` para
    ESCREVER um rótulo. Meça você mesmo e classifique uma a uma: a diferença entre "trava com um
    infrator" e "trava com onze falsos positivos" é essa classificação.
12. **A paleta já tem o ponto de entrada marcado pela F49** — cabeçalho, item 3, apontando as
    passagens **106/109** (`soAdmin`/`soDev`), **312** (`podeEscrever`) e **441** (o filtro do grupo
    "Ações"). ⚠ **Os números da ficha do plano são de ANTES da F49**: o import da action está na **75**
    (não 42) e o `{r.filial_nome}` está na **556** (não 523). Confirme antes de citar qualquer linha.
13. **O molde da `0129` está pronto e é para copiar, não inventar.**
    `public.pode_escrever_arquivo_termo(p_nome text)` está na `0069:313-332`: `language sql`,
    `stable`, `security definer`, `set search_path = public`, `revoke all … from public, anon`,
    `grant execute … to authenticated`, mais um `comment on function` de seis linhas que explica o
    `coalesce(…, true)` — **que a irmã de leitura NÃO leva**, e o motivo está escrito no próprio
    comment. A policy de SELECT do bucket é `alter policy "termos leitura operador" on storage.objects
    using (bucket_id = 'termos')` (`0066:47`), com o comentário acima dela dizendo que a leitura fica
    ampla **de propósito**. Esse comentário tem de ser reescrito junto, ou ele passa a mentir.
14. **`k_invoker_anon` obriga a `0129` e o esvaziamento a serem o MESMO commit.** A lista está em
    `supabase/tests/catalogo_secdef.sql:106-109` com as cinco funções, e a asserção **6b** reprova
    nome na lista que **já não seja alcançável** por `anon` (linhas 271-272: *"para a exceção não
    sobreviver ao motivo que a criou"*). Os cinco `revoke` esvaziam a lista; se o roteiro não for
    ajustado no mesmo commit, o `banco-sem-docker` fica vermelho por construção — e vermelho **certo**,
    que é o comportamento desejado do gate.

**Estado de partida, medido:** `main` limpa, `package.json` em **1.54.0**, tag `v1.54.0` publicada,
última migration **`0128`** (ainda **sem aplicar em produção**, terceira fase seguida), último id da
matriz **R-ACC-39**, contador **243**. `supabase/tests/storage_termo.sql` **não existe** — é arquivo
novo, e o runner (`scripts/db/rodar-roteiros.sh`) o descobre sozinho, mas **exige** a linha
`FIM <nome>: N asserções, M falhas` e **recusa roteiro com zero asserção**.

**Os métodos que continuam valendo:** o do §15 da F45 — *"comando não encontrado" é hipótese, não
conclusão* — e o que a F47, a F48 e a F49 confirmaram três vezes seguidas: **número escrito na ficha
se mede antes de repetir.** Foram 34 asserções que viraram 58, 54 policies que viraram 55, e "nove
leituras sem guarda" que viraram nove de dezenove.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Consertar os dois tripwires do visualizador que já estão furados, dar escopo ao canal de tempo real e
criar — trivialmente hoje — os três lugares onde o recorte de tenant vai encostar. Ao final:
`fronteira-viewer.test.ts` deixa de ser deny-list de três nomes e passa a ser **allow-list de tabelas
e de RPCs sobre superfície DERIVADA da assinatura** (toda função de `src/lib/queries/**` que aceite
client resolvido está declarada, `tipos-item.ts` incluído);
`confinamento-viewer.test.ts` deriva a superfície do **grafo de imports** e ganha `SUPERFICIE_MINIMA`
como catraca que só sobe; `queries/relatorios/comum.ts` para de engolir o erro do `maybeSingle()` e a
varredura dos quatro `const { data } = await` fica congelada; o canal de tempo real tem **nome
parametrizado por `chaveDoEscopo`** e o gancho do filtro, com ata dizendo que o Realtime **não passa
por `lib/queries`** e portanto não herda recorte nenhum que a virada ponha lá; o `ViewerAutoRefresh`
para de refrescar aba oculta e coalesce rajadas; `podeLer(p)` nasce em `permissoes.ts` **com
consumidor real na paleta de comandos** e com a trava de que nenhum componente deriva autorização de
`filiais.length`; `use-filtros-tabela.ts` ganha cabeçalho e trava de que `CampoFiltro` não conhece
empresa; e a migration **`0129`** cria `public.pode_ler_arquivo_termo(text)`, põe a policy de SELECT
do bucket `termos` para chamá-la **sem mudar quem lê**, e revoga o `EXECUTE` de `anon` das cinco
funções INVOKER. Versão **1.55.0** com tag publicada; PR mergeado com `verificar` e `banco-sem-docker`
verdes.
**Sem dependência nova, sem recorte de filial, sem `empresa_id`, sem mover um único objeto de bucket.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo e as 8 regras permanentes. A **1** (escopo da ordem
  atual — esta fase tem QUATRO fases vizinhas encostadas nela: F51, F52, F57, F61, F67, F70), a **3**
  (custo R$ 0, stack FECHADA — nenhum pacote novo, nem em `devDependencies`) e a **8** (versão)
  decidem metade das escolhas e não se reinterpretam. Leia com atenção redobrada o parágrafo do
  **modelo de acesso** (o piso de leitura, `papel_atual()`, as cinco guardas) e a frase *"a UI é a
  segunda linha, nunca a única"* — ela é o motivo pelo qual `podeLer` nasce com aviso de que não é
  segurança.
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns a TODAS as fases, que herdam
  para cá — em especial a **2**, estado de repouso, a **3**, escopo fora explícito, e a **4**, a
  evidência vermelha não se esconde), **§5 → F50** (a ficha: Objetivo / Entra / Não entra / Entregas /
  Pronto quando / Trava / Dependências / Risco / Reversão), e depois **§5 → F57**, **§5 → F61**,
  **§5 → F67** e **§5 → F70** — não para fazer, mas para saber o que **não** é seu: o recorte de
  filial, as chaves de storage, o prefixo de tenant nos termos e o seletor de empresa.
  ⚠ **A ficha da F50 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem, vale a
  ficha, e a divergência vira nota no relatório. As divergências que já conheço estão em "O
  diagnóstico" — confirme cada uma antes de agir.
- `@docs/RELATORIO-F49.md` — é o estado de onde você parte, não história. §12.1 (a `0128` sem aplicar,
  terceira fase), §12.2 (o backlog nomeado para VOCÊ: a revogação do `EXECUTE` de `anon`, o `podeLer`,
  o `comum.ts`, a reescrita do `fronteira-viewer.test.ts`) e §11 (o que a F49 NÃO prova).
- `@docs/RELATORIO-F48.md` §8.2 — o achado dos cinco INVOKER, com a justificativa CORRIGIDA pela
  revisão adversarial (`valida_lancamento_item` **lê** `lancamentos_item` quatro vezes; o que a torna
  inofensiva é ser `returns trigger` e INVOKER, não "não tocar tabela"). Copie a justificativa certa
  para a `0129` — num arquivo de segurança, o motivo escrito importa mais do que a conclusão.
- `@src/lib/queries/relatorios/fronteira-viewer.test.ts` (63 linhas) — **leia inteiro, comentários
  incluídos.** É o arquivo que você reescreve, e o cabeçalho dele explica por que o viewer roda sob
  service_role e por que falhar ali é sinal para revisar a decisão, não para consertar o teste. Esse
  tom sobrevive à reescrita.
- `@src/components/relatorios/confinamento-viewer.test.ts` (261 linhas) — o irmão dos LINKS. Você
  troca **só** a função `arquivosDaSuperficie()` (linhas ~26-43) e acrescenta a catraca. As sete
  asserções, as três exceções registradas e o comentário sobre não tirar comentários antes de varrer
  **ficam** — aquele parágrafo é uma decisão paga com uma rodada vermelha na F32.
- `@src/lib/queries/relatorios/comum.ts` (linhas 1-25) — o `maybeSingle()` que descarta o `error`.
- `@src/components/relatorios/realtime-refresh.tsx` (92 linhas) e
  `@src/components/relatorios/viewer-auto-refresh.tsx` (69 linhas) — leia os dois inteiros. Os
  comentários **RV-16** explicam a armadilha de hidratação e o padrão do `setTimeout(…, 0)` para não
  chamar `setState` no corpo do efeito (`react-hooks/set-state-in-effect`). Seu código novo obedece
  aos dois, ou o lint reprova por um motivo que você já tinha na mão.
- `@src/components/layout/permissoes.ts` (68 linhas) — leia inteiro. Duas funções, um cabeçalho que
  declara o módulo PURO de propósito (sem `server-only`, sem Supabase, sem JSX) e o aviso final:
  *"esconder um botão é ergonomia, não segurança"*. `podeLer` nasce dentro dessa doutrina.
- `@src/components/layout/paleta-comandos.tsx`, cabeçalho (linhas 1-45) — a F49 deixou o ponto de
  entrada do `podeLer` **marcado e datado** ali, no item 3. Siga o que está escrito; o item 3 do
  cabeçalho passa a descrever o que existe, não o que virá.
- `@src/components/itens/lancar-item-campos.tsx` linha 139, e os vizinhos
  `@src/components/movimentacoes/nova/passo-movimentacao.tsx:389` e
  `@src/components/movimentacoes/nova/secao-contrapartida.tsx:251` — o infrator e o molde certo, lado
  a lado. É a Decisão 5.
- `@src/components/relatorios/use-filtros-tabela.ts` — `CampoFiltro` é `'filial' | 'categoria' |
  'motivo' | 'tipo'` (linha 36) e `filial` só aparece no consolidado (linha ~130). É o precedente
  pronto para alguém acrescentar `empresa` e transformar recorte de tenant em `Array.filter` no
  navegador de quem não devia ter recebido as linhas.
- `@supabase/migrations/0069_termos_mesma_filial.sql` linhas **313-338** — a
  `pode_escrever_arquivo_termo`, o `comment on function`, o `revoke`/`grant` e o índice de apoio.
  Molde exato. E `@supabase/migrations/0066_papeis_storage.sql` linhas **40-70** — as quatro policies
  do bucket `termos` e o comentário que diz que a leitura fica ampla de propósito.
- `@supabase/tests/catalogo_secdef.sql` linhas **100-115** e **260-290** — `k_invoker_anon` e as
  asserções 6a/6b. É o que obriga a `0129` e o esvaziamento da lista a serem o mesmo commit.
- `@supabase/tests/papeis_rls.sql` e `@supabase/tests/catalogo_policies.sql` — os dois já citam
  `pode_escrever_arquivo_termo`; veja como um roteiro afirma coisa sobre policy de Storage antes de
  escrever `storage_termo.sql`.
- `@scripts/db/rodar-roteiros.sh` (cabeçalho, linhas 1-40) — as cinco coisas que o runner faz além de
  rodar. A linha `FIM <nome>: N asserções, M falhas` é obrigatória e roteiro com zero asserção é
  **recusado**.
- `@scripts/db/diff-tipos.mjs` (cabeçalho) e `@scripts/gen-types.ts` (linhas 1-45) — o gate de deriva
  e o gerador. Leia ANTES de escrever a migration: é o que decide a Decisão 6.
- `@src/lib/ci-passos.test.ts` — o `describe 5` afirma que todo `*.test.ts?(x)` do repositório está
  coberto por algum `include` do `vitest.config.mts`. Seus testes novos entram nessa varredura.
- `@vitest.config.mts` — dois projetos (`puro`, ambiente node; `componentes`, `renderToStaticMarkup`
  **sem jsdom**). Efeito de React não roda no segundo, e isso decide a Decisão 4.
- `@src/lib/validators/catalogos-seguranca.test.ts` e `@src/lib/actions/guardas-de-action.test.ts` —
  as travas de mesa da F48 e da F49, com as sabotagens que provam que sabem reprovar. São o molde
  estrutural das suas travas novas: catraca que só encolhe, exceção **nominal com motivo escrito**,
  nunca isenção por categoria ou por prefixo.
- `@docs/MATRIZ-REGRAS.md`, seção **A6 — Acesso e segurança de dados (R-ACC)**. Último id em uso:
  **R-ACC-39**; contador **243** (emenda F49, no fim do arquivo). Siga esse padrão de emenda.
- `@docs/RUNBOOK-BANCO.md` — o caminho A do apply, o bloco de VERIFICAÇÃO PÓS-APPLY e a regra do
  ensaio antes de produção. Leia antes de tocar em qualquer banco.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Nenhum item é para acreditar. Cada um tem uma consulta ou um comando que o confirma ou o derruba, e o
relatório registra o que **você** mediu, inclusive quando bater com o que está escrito aqui.

1. **`npm run db:types:diff` roda no `banco-sem-docker` e reprova quando o banco tem o que o
   `database.ts` não tem.** Confirme em `.github/workflows/ci.yml` (por volta da linha 293) e no
   cabeçalho do `diff-tipos.mjs`. Confirme também que `pode_escrever_arquivo_termo` está em
   `src/lib/types/database.ts` (~1501) e que `npm run db:types` gera de **produção**. Consequência: a
   `0129` **quebra o CI** se o `database.ts` não conhecer a função nova. Decisão 6.
2. **`anotacoes` não tem `filial_id`.** Confirme lendo `0017_anotacoes.sql:6-13` e compare com
   `0015_lancamentos_item.sql:19` e `0003_tabelas.sql:76`. Consequência: "filtro nas três
   assinaturas" não existe hoje. Decisão 2.
3. **12 arquivos de `src/lib/queries/**` aceitam client resolvido, e a superfície declarada de hoje
   cobre 9.** Confirme varrendo por assinatura (`client?: SupabaseClient<Database>` e o alias
   `DbClient`), não por pasta. Os quatro que a regra derivada arrasta: `tipos-item.ts`,
   `conflitos.ts`, `import-logs.ts`, `pendencias-detalhe.ts`. Para CADA um, meça **quem o chama com
   `acesso.client`** antes de decidir se entra ou vira exceção nominal.
4. **A allow-list nasce com 9 tabelas (uma delas VIEW) e 7 RPCs.** Confirme varrendo `.from(` e
   `.rpc(` na superfície. Se o seu número divergir, o seu número vale — escreva os dois.
5. **`SUPERFICIE_MINIMA` não existe hoje** em `confinamento-viewer.test.ts`, e a superfície dele é
   por PASTA. Confirme. O que você troca é `arquivosDaSuperficie()`, não o teste inteiro.
6. **Quatro `const { data } = await` em `src/lib/queries/**`**, e três não são de relatório. Confirme
   e liste os quatro com arquivo:linha.
7. **`filiais.slug` é unique global hoje** (`0003_tabelas.sql:11`). Confirme: o conserto do
   `maybeSingle()` é preventivo, e o relatório diz isso em vez de fingir que havia bug ativo.
8. **`RealtimeRefresh` em três telas, sem prop nenhuma.** Confirme grepando o componente em `src/`.
9. **O projeto `componentes` não tem jsdom.** Confirme no `vitest.config.mts`. Efeito não roda ali.
10. **`lancar-item-campos.tsx:139` deriva cargo de `filiais.length`, e os dois vizinhos perguntam
    `papel !== 'consulta'`.** Confirme os três. Depois classifique **uma a uma** as outras ~10
    ocorrências de `filiais.length`/`filiais[0]` — quantas são autorização e quantas são ergonomia.
11. **Os números de linha da paleta na ficha do plano são de antes da F49** (import na 75, não 42;
    `filial_nome` na 556, não 523). Confirme antes de citar linha.
12. **A `0128` não está em produção.** Confira, **no começo da sessão**, se o MCP do Supabase está
    conectado — é o que decide se você aplica ou carrega pendência.

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste`
- `npm run db:test` · `npm run db:test:um <roteiro>` · `npm run db:test:mutations` · `npm run db:types:diff`
- `npm run db:lock` — **obrigatório** nesta fase: ela ACRESCENTA a `0129`.
- `npm run db:types` — só depois do apply em produção; leia a Decisão 6 antes de rodar.
- `npm run verificar:actions` · `node scripts/smoke/smoke-prod.mjs`
- `gh run watch` / `gh run view --log-failed` — o `gh` EXISTE nesta máquina (F45 §15); pode não estar
  no PATH da sessão.

# Escopo

## Dentro

### 1. `fronteira-viewer.test.ts` reescrito — superfície DERIVADA e listas BRANCAS
Três peças, e nenhuma delas é opcional:
- **Superfície derivada da assinatura.** Toda função de `src/lib/queries/**` que aceite
  `client?: SupabaseClient<Database>` (ou o alias `DbClient`) está **declarada**: ou faz parte da
  superfície do viewer, ou é **exceção nominal com motivo medido** (quem a chama, e por que esse
  caminho não alcança o viewer). Derivar da assinatura é o ponto: a pasta mente, a assinatura não.
  **Caso de sanidade obrigatório:** `expect(superficie).toContain('queries/tipos-item.ts')`.
- **Recusa de atribuição de `acesso.client` a variável.** Um `const c = acesso.client` derrota a
  varredura por call-site; a trava tem de acusá-lo.
- **Listas BRANCAS de tabelas em `.from(` e de RPCs em `.rpc(`.** Deny-list não cobre a tabela que
  ainda não nasceu — e a virada cria `empresas`. Cada nome na lista tem o motivo de estar lá;
  `v_fila_pendencias` é view e entra como as outras. Nome fora da lista **reprova**.
- A lista é **catraca**: só encolhe. Um teste que afirme o tamanho e reprove ao crescer é a forma mais
  barata — escolha a sua e escreva o porquê.
- O cabeçalho novo mantém o TOM do atual: por que o viewer roda sob service_role, e por que falhar ali
  é sinal para revisar a decisão, não para consertar o teste.

### 2. `confinamento-viewer.test.ts` — superfície do grafo de imports + `SUPERFICIE_MINIMA`
Troque **só** `arquivosDaSuperficie()`: em vez de `readdirSync` de uma pasta, parta das três rotas de
relatório e siga os imports **relativos e por alias `@/`** até o fecho transitivo, dentro de `src/`.
É pré-requisito declarado da F61, que leva componentes de `layout/` para dentro das telas de
relatório — hoje eles ficariam fora da varredura e o vazamento entraria em silêncio.
`SUPERFICIE_MINIMA` é catraca **que só sobe**: a superfície derivada nunca pode encolher sem alguém
mexer no número. As sete asserções existentes, as três exceções registradas e o parágrafo sobre não
tirar comentários antes de varrer **permanecem**.
Sanidade obrigatória: a superfície derivada **contém** os seis arquivos fixos de hoje, ou a derivação
está errada e você trocou uma rede por um furo.

### 3. `queries/relatorios/comum.ts` para de engolir o erro
`resolverFilialPorSlug` (linhas 15-25) passa a ler o `error` e a **lançar** — mensagem em pt-BR, no
padrão dos vizinhos (`throw new Error('Falha ao …: ' + error.message)`), com comentário datado
dizendo o que muda: hoje `filiais.slug` é unique global e isso é conserto **preventivo**; quando a
unicidade virar por empresa, o PGRST116 viraria `notFound()` mudo em TODA rota de relatório, para
operador e para viewer, sem log. **Uma linha separa "quebrou" de "quebrou em silêncio".**
Mais a **varredura congelada**: teste que lista os `const { data } = await` de `src/lib/queries/**`
com os infratores atuais nomeados (são quatro; três não são de relatório) e reprova quando aparecer um
quinto. A lista só encolhe.

### 4. Realtime com escopo — o gancho, não o recorte
- **`chaveDoEscopo`**: função nova, em módulo próprio, que devolve a chave do escopo corrente. Hoje
  devolve um valor constante e o nome do canal deixa de ser literal
  (`supabase.channel('relatorio-tempo-real')` → `supabase.channel(nomeDoCanal(chaveDoEscopo()))`).
  A F61 vai reusá-la para as 7 chaves de storage (3 delas `localStorage`, e `wap:compra:defaults`
  guarda uma FILIAL e atravessa abas e dias) — **a assinatura que você escolher tem de servir aos
  dois usos** (Decisão 3).
- **O gancho do filtro nas assinaturas** — leia a Decisão 2 antes de escrever uma linha. A regra é
  dura: **não emita filtro que você não consiga provar total hoje.** Um filtro errado não dá erro:
  ele faz o canal parar de acordar, o selo "ao vivo" mente e ninguém percebe por semanas.
- **A ata registra, com todas as letras**: o Realtime **não passa por `src/lib/queries`** e portanto
  **não herda nenhum recorte** que a virada ponha lá; a trava dele é a publication
  `supabase_realtime` mais RLS, e isso é F70. Sem essa frase escrita, a virada vai supor herança que
  não existe — e `postgres_changes` entrega o **payload da linha** ao navegador.

### 5. `ViewerAutoRefresh` — a única mudança visível, e é decisão do Johnny (08/09/2026)
Escopo COMPLETO, escolhido por ele: (a) o ciclo de 60 s **pausa** quando `document.visibilityState`
é `'hidden'`; (b) ao voltar para a aba, refresca **uma vez** se o intervalo já venceu, e o carimbo
acompanha; (c) as rajadas do realtime **coalescem** (o `RealtimeRefresh` já tem debounce de 2 s — o
que falta é não enfileirar refresh atrás de refresh). Hoje a rota mais cara do sistema roda a cada
60 s numa aba esquecida, e cada escrita de qualquer usuário dispara `router.refresh()` em toda aba
aberta. Obedeça aos comentários **RV-16** dos dois arquivos: nada de `setState` no corpo do efeito,
nada de carimbo calculado no primeiro render. A trava sai da Decisão 4.
**Quem está com a aba aberta não percebe diferença** — é assim que esta mudança cabe nesta fase.

### 6. `podeLer(p)` em `permissoes.ts`, com consumidor real
`export function podeLer(p: Permissoes | null | undefined): boolean { return p !== null && p !== undefined }`
— trivial hoje **de propósito**, e é o ponto onde a revogação do piso vai encostar (a F70 lhe dá
corpo, com `empresaId`). Nasce com:
- **comentário** no tom do resto do módulo, dizendo o que ele responde, o que **não** responde
  ("pode ler O QUÊ" é F57/F70) e o aviso de sempre — esconder não é impedir;
- **consumidor real na paleta de comandos**, no ponto que a F49 marcou (item 3 do cabeçalho: as
  passagens 106/109/312/441). O item 3 passa a descrever o que **existe**;
- **trava**: nenhum componente deriva autorização de `filiais.length` ou `filiais[0]`. Ela **não
  nasce verde** — ver Decisão 5. Exceções, se houver, são **nominais com motivo escrito**, e a lista
  só encolhe.
**Escopo do Johnny, 08/09/2026:** o `podeLer` alcança **a paleta e mais nada** nesta fase. As 53
aparições de `ehOperador` na superfície de relatório (que perguntam "operador ou viewer por senha?",
outra pergunta) viram **censo escrito no relatório**, para a F70 decidir. Não as converta.

### 7. `use-filtros-tabela.ts` — o cabeçalho e a trava
Cabeçalho em prosa dizendo que o hook filtra **o que já chegou**: é recorte de leitura voluntária,
**nunca de autorização**; quem decide o que chega é o servidor. E `it('CampoFiltro não conhece a
empresa')`, lendo o arquivo como TEXTO — a trava existe para o dia em que alguém acrescentar
`'empresa'` à união da linha 36 e transformar recorte de tenant em `Array.filter` no navegador de
quem não devia ter recebido as linhas.

### 8. Migration `0129` — a fechadura de leitura e os cinco `revoke`
Uma migration, três blocos, cada um com comentário datado:
- **`public.pode_ler_arquivo_termo(p_nome text)`**, espelho exato da `pode_escrever_arquivo_termo`
  (`0069:313`) em linguagem, volatilidade, `security definer`, `search_path`, `revoke`/`grant` e
  `comment on function` — **mas com a regra de leitura de HOJE** (todo logado ativo) e **sem
  `coalesce(…, true)`**: aquele fallback existe na escrita por causa da janela upload→insert; numa
  policy de leitura ele seria o furo de volta. Escreva esse motivo no `comment`.
- **A policy de SELECT do bucket `termos`** (`alter policy "termos leitura operador"`, hoje
  `using (bucket_id = 'termos')`) passa a chamá-la. **Zero mudança de comportamento**: quem lia
  continua lendo, e você prova isso pelo roteiro. Reescreva também o comentário da `0066:44-46`, que
  hoje diz que a leitura fica ampla "de propósito" — ele passa a dizer onde a regra mora agora.
- **Os cinco `revoke`** do achado 8.2 da F48 (`chave_identidade_ativo`, `hoje_brt`,
  `mov_da_carga_import`, `status_apos_movimentacao`, `valida_lancamento_item`), com a justificativa
  **corrigida** pela revisão adversarial da F48 — e, no MESMO commit, `k_invoker_anon` esvaziada em
  `supabase/tests/catalogo_secdef.sql` (a asserção 6b acusa a lista obsoleta na hora, que é o
  comportamento certo).
- `npm run db:lock` depois de acrescentar a migration. E leia a **Decisão 6** antes de abrir o PR.

### 9. `supabase/tests/storage_termo.sql` — o roteiro novo
Prova, contra o Postgres do CI, que **a leitura do bucket `termos` continua exatamente quem era**:
o mesmo conjunto de objetos legível antes e depois da policy nova, para cada cargo (`admin`,
`operador`, `consulta`) e para `anon`; e que a função nova recusa o que a de escrita recusaria por
inexistência de vínculo — sem o `coalesce`. Termine com a linha `FIM storage_termo: N asserções, M
falhas` e **nunca zero asserção** (o runner recusa). Dado 100% sintético.

### 10. A `0128` e a `0129` em produção — tenta as duas, e segue se não der
**Decisão do Johnny, 08/09/2026.** Confira no começo se o MCP do Supabase está conectado.
- Se estiver: aplique primeiro a **`0128`** (`0128_adota_bkp_relatorios_f6a.sql`) pelo caminho A do
  `RUNBOOK-BANCO.md`, com as três consultas do bloco *VERIFICAÇÃO PÓS-APPLY* (a terceira devolve
  **2**); só então a **`0129`**, com verificação própria escrita por você: a função existe, a policy
  a chama, e **um objeto do bucket continua legível por quem o lia**.
- Se não estiver: **não insista, não invente caminho alternativo, não mexa em credencial** — carregue
  as duas pendências para o relatório com o mesmo texto honesto da F47, F48 e F49, e siga. A fase é
  válida sem o apply; o que muda é a Decisão 6.

### 11. O fechamento de sempre
`npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; `npm run db:lock` rodado;
entrada no `CHANGELOG.md`; bump MINOR para **1.55.0** no `package.json`; entrada no topo de
`src/lib/versoes/registry.ts` (2 a 6 mudanças em LINGUAGEM DE OPERADOR — há teste que recusa
vocabulário de desenvolvedor); tag anotada `v1.55.0` publicada; emenda F50 em `docs/MATRIZ-REGRAS.md`
a partir de **R-ACC-40**, com contador atualizado; ata em `docs/DECISOES.md`; `docs/RELATORIO-F50.md`;
PR mergeado com `verificar` e `banco-sem-docker` verdes.

## Fora — não toque
- **Nenhum `empresa_id`, em lugar nenhum.** Nem coluna, nem parâmetro, nem filtro. É F62+.
- **Nenhum recorte de filial em query nenhuma** (F57), nenhum seletor de empresa (F70), nenhuma
  mudança no que uma query FAZ — nenhum `select` novo, nenhuma coluna a mais.
- **Nada da F61:** não mexa nas 7 chaves de storage, não leve `chaveDoEscopo` para `localStorage`,
  não toque em `dicaConfirmacaoNaoConfere` nem nos componentes de `layout/` além da paleta.
- **Nada da F67:** **não mova nenhum objeto de bucket**, não crie prefixo de tenant no caminho dos
  termos, não reescreva `arquivo_path`. A decisão registrada é que a leitura será fechada **pelo join
  com `termos_gerados`**, e é por isso que ela não exige mover arquivo com dado pessoal.
- **Nada da F51/F52:** não decomponha `importar_ativos_substituir`, não acrescente guarda de escopo a
  RPC nenhuma, não toque em `exigir_gestao_de` nem em `existe_outro_admin_ativo`.
- **Não converta as 53 aparições de `ehOperador`** — decisão do Johnny, 08/09/2026: censo escrito, não
  refatoração.
- **Não reescreva as sete asserções do `confinamento-viewer.test.ts`** nem as três exceções
  registradas: só a função que monta a superfície.
- Nenhuma dependência nova, nem em `devDependencies` (jsdom incluído — a Decisão 4 existe por isso).
  Nenhum recurso pago.
- Nenhum dado real: nome de colaborador, patrimônio ou linha de planilha da WAP não entra em fixture,
  teste, roteiro SQL, evidência ou comentário. Tudo sintético (`WAP0001234` / "Fulano").
- Backlog herdado, e continua fora — entrega avulsa PATCH: o comentário morto em
  `scripts/gen-types.ts` (cita o job `banco`, removido na v1.51.1) e a exclusão `_%` em
  `supabase/ci/impressao-schema.sql`.

# A ordem de entrega não é livre
1. **Medir primeiro**, e escrever `docs/PLAN-F50.md` com os números reais: os 12 arquivos de
   assinatura e quem chama cada um com `acesso.client`; as 9 tabelas e 7 RPCs; os 4
   `const { data } = await`; as ~11 ocorrências de `filiais.length` classificadas uma a uma; as três
   montagens do `RealtimeRefresh`. Teste escrito a partir do número da ficha nasce errado.
2. **Decisões 1 a 6 tomadas e registradas ANTES de escrever código** — cada uma decide um arquivo
   inteiro, e a 6 decide se o PR consegue ficar verde.
3. **Frente 1 (tripwire de leitura) ANTES de qualquer outra coisa.** Ela nasce **VERMELHA** acusando
   `tipos-item.ts` e os outros arrastados pela assinatura — e é isso que prova que ela tem dentes.
   **Guarde a saída vermelha**: é evidência de relatório, não estado intermediário a esconder (regra 4
   do §4).
4. **Frente 2** (confinamento derivado), com a sanidade de que a superfície nova **contém** a antiga.
5. **Frentes 3, 6 e 7** — as baratas e de mesa, com `npm run test` a cada incremento.
6. **Frentes 4 e 5** (Realtime e auto-refresh) juntas, porque compartilham o `chaveDoEscopo` e a
   doutrina do coalesce.
7. **Frente 8 e 9** (migration `0129` + roteiro), com `npm run db:lock` e o esvaziamento de
   `k_invoker_anon` no MESMO commit.
8. **Frente 10** (apply em produção, se der) — e só então a Decisão 6 se resolve de um jeito ou de
   outro.
9. **Matriz, CHANGELOG, versão, tag, ata, relatório e PR no fim.**

# As decisões obrigatórias — meça antes de decidir, registre em `docs/DECISOES.md`
**Decisão 1 — os quatro arquivos que a regra da assinatura arrasta.** `tipos-item.ts` entra (a ficha
manda, e os dois call-sites com `acesso.client` provam). Faltam `conflitos.ts`, `import-logs.ts` e
`pendencias-detalhe.ts`. Para cada um: **quem o chama, com que client, a partir de que rota**? Se
nenhuma rota de relatório o alcança, ele é **exceção nominal com o motivo medido** — nunca omissão, e
nunca "não é de relatório" como categoria. Se alcança, entra na superfície e as listas brancas crescem
com os nomes que ele usa. **A resposta certa pode ser diferente para cada um dos três.**

**Decisão 2 — o `filter:` do Realtime, com `anotacoes` sem `filial_id`.** As opções sérias:
**(a)** o gancho entra **sem literal**: as três assinaturas passam a tirar suas opções de **uma única
função** (`opcoesDaAssinatura(tabela)`), que hoje devolve o objeto sem `filter` e amanhã devolve com;
a trava afirma que nenhuma das três monta opções à mão. Custo: nada muda no fio, e o gancho é real.
**(b)** filtro literal nas duas que têm `filial_id` e nada na terceira: assimetria que a F70 vai ter
de desfazer, e um filtro que **recorta de verdade** hoje — se a tela consolidada depende de acordar
com insert de outra filial, isso é **mudança de comportamento**, que esta fase não faz.
**(c)** filtro "total" inventado (`id=gt.0` e afins): **não é opção** — é string mágica que ninguém
consegue provar, e um filtro errado não dá erro, só faz o canal parar de acordar em silêncio.
A régua: **não emita filtro que você não consiga provar total hoje.** Meça se a tela consolidada
precisa acordar com filial alheia antes de decidir, e escreva o que mediu.

**Decisão 3 — a assinatura de `chaveDoEscopo`.** A F61 vai reusá-la para 7 chaves de storage (3 de
`localStorage`, uma delas guardando uma FILIAL e atravessando abas e dias). Escolha assinatura e lugar
que sirvam aos DOIS usos — nome de canal de realtime e prefixo de chave de storage — e escreva no
cabeçalho dela quem são os dois consumidores e o que ela vai devolver depois da virada. Um
`chaveDoEscopo()` que só serve para canal obriga a F61 a criar o segundo, e aí existem duas.

**Decisão 4 — como travar o `ViewerAutoRefresh` sem jsdom.** O projeto `componentes` é
`renderToStaticMarkup`: efeito não roda, e **jsdom é dependência nova, que a regra 3 proíbe**. Opções:
**(a)** extrair a decisão para função **pura** (`deveRefrescar(agora, ultimo, visivel)`) e testá-la no
projeto `puro` — o comportamento fica conferível de verdade, ao custo de um módulo a mais; **(b)**
asserção de texto sobre o arquivo (que ele consulta `visibilityState` e limpa o intervalo) — barato,
prova pouco. Decida com o custo medido; a (a) é a que a casa vem preferindo desde a F45.

**Decisão 5 — `lancar-item-campos.tsx:139`.** `podeCadastrar={filiais.length > 0}` deriva **cargo** do
comprimento de uma lista, e o comentário ao lado admite isso por escrito; os dois vizinhos usam
`papel !== 'consulta'`. Meça o efeito da troca: **um operador vinculado a ZERO filiais** passa a ver o
cadastro que hoje não vê? Se sim, é **mudança de comportamento** e não é desta fase — então vira
exceção nominal com motivo escrito **mais** item de backlog nomeado para a F70. Se não, corrija e
mostre a equivalência. As duas saídas são aceitáveis; **omitir o caso não é**.

**Decisão 6 — como o `database.ts` conhece a função nova sem quebrar o CI.** `db:types:diff` reprova
se o banco tiver o que o arquivo não tem, e `db:types` **gera de produção**. Opções: **(a)** aplicar a
`0129` em produção e então rodar `npm run db:types`, commitando o arquivo regenerado — só funciona se
o MCP estiver conectado, e é o caminho limpo; **(b)** hand-fix nominal no `database.ts`
acrescentando a entrada de `pode_ler_arquivo_termo` no molde exato da irmã de escrita (~linha 1501),
com comentário datado na ata — o arquivo **já tem hand-fixes deliberados**, registrados nas atas de
14/07/2026 e 31/08/2026, então o precedente existe e o gate compara **conjunto**, não texto. **(c)**
deixar como está: **não é opção** — o `banco-sem-docker` é *required check* e o PR não mergeia.
Decida pelo ambiente que você encontrar, e diga no relatório qual foi e por quê.

# A trava
`fronteira-viewer.test.ts` (superfície derivada da assinatura + listas brancas de tabela e de RPC,
catraca que só encolhe), `confinamento-viewer.test.ts` (superfície do grafo de imports +
`SUPERFICIE_MINIMA` que só sobe), a varredura congelada dos `const { data } = await`, a trava do
`podeLer` (nenhum componente deriva autorização de `filiais.length`), `it('CampoFiltro não conhece a
empresa')`, a trava do Realtime (as três assinaturas saem de uma função só) e, no banco,
`storage_termo.sql` mais a asserção **6b** de `catalogo_secdef.sql`, que acusa `k_invoker_anon`
obsoleta. As de mesa rodam sem banco; as do banco rodam no `banco-sem-docker`.

# Critérios de aceitação — autoverifique item a item e cole a evidência de cada um
1. `fronteira-viewer.test.ts` deriva a superfície da **assinatura**, não da pasta, e
   `expect(superficie).toContain('queries/tipos-item.ts')` passa.
2. Os quatro arquivos arrastados pela assinatura estão **cada um** declarados: na superfície, ou como
   exceção nominal com o motivo **medido** (quem chama, de onde). A Decisão 1 está na ata.
3. As listas de tabelas e de RPCs são **brancas**, com motivo por nome, e reprovam nome novo —
   provado por sabotagem, com a saída colada.
4. A trava recusa `const c = acesso.client` (atribuição a variável) — provado por sabotagem.
5. `confinamento-viewer.test.ts` deriva do grafo de imports, **contém** os seis arquivos fixos de
   hoje, tem `SUPERFICIE_MINIMA` como catraca que só sobe, e mantém as sete asserções e as três
   exceções — provado por sabotagem (arquivo de `layout/` importado por tela de relatório é varrido).
6. `resolverFilialPorSlug` lança em vez de devolver `null` silencioso, com comentário datado dizendo
   que hoje `filiais.slug` é unique global e que o conserto é preventivo.
7. A varredura dos `const { data } = await` está congelada com os quatro nomes atuais e reprova o
   quinto — provado por sabotagem.
8. O canal de tempo real tem nome parametrizado por `chaveDoEscopo`; as três assinaturas tiram as
   opções de **uma única função**; a Decisão 2 está tomada e registrada, e **nenhum filtro que não se
   possa provar total foi emitido**.
9. A ata registra, com todas as letras, que o Realtime **não passa por `lib/queries`** e não herda
   recorte nenhum da virada.
10. `ViewerAutoRefresh` pausa em aba oculta, refresca uma vez ao voltar se o intervalo venceu, e
    coalesce rajadas; obedece aos comentários RV-16; a trava da Decisão 4 existe e prova o que afirma.
11. `podeLer` existe em `permissoes.ts`, com comentário no tom do módulo, **consumido pela paleta** no
    ponto que a F49 marcou — e o item 3 do cabeçalho da paleta passa a descrever o que existe.
12. A trava de `filiais.length` existe; a Decisão 5 está tomada, registrada e aplicada; as ~11
    ocorrências estão **classificadas uma a uma** no relatório.
13. `use-filtros-tabela.ts` tem o cabeçalho em prosa e `it('CampoFiltro não conhece a empresa')`
    passa — e reprova se alguém acrescentar `'empresa'` à união (provado por sabotagem).
14. A `0129` cria `pode_ler_arquivo_termo` no molde da irmã de escrita, **sem `coalesce(…, true)`**,
    com `comment on function` explicando por quê; a policy de SELECT a chama; o comentário da `0066`
    foi reescrito.
15. Os cinco `revoke` estão na `0129` com a justificativa **corrigida** da F48, e `k_invoker_anon` foi
    esvaziada no MESMO commit; `npm run db:test` passa no CI com a 6b verde.
16. `supabase/tests/storage_termo.sql` prova que **quem lia continua lendo**, tem a linha `FIM` e
    **mais de zero** asserções; o dado é sintético.
17. `npm run db:lock` foi rodado; `npm run db:types:diff` passa no `banco-sem-docker` — a Decisão 6
    está registrada com o caminho que você usou.
18. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; nenhuma dependência
    nova no `package.json`; `git diff` **não** mostra objeto de bucket movido nem `empresa_id` em
    lugar nenhum.
19. `docs/MATRIZ-REGRAS.md` traz a emenda F50 a partir de **R-ACC-40**, com o teste que prova cada
    regra e o contador atualizado.
20. Versão **1.55.0** no `package.json` e no topo do `registry.ts` (linguagem de operador), tag
    `v1.55.0` anotada e publicada, entrada no `CHANGELOG.md`.
21. PR mergeado com `verificar` e `banco-sem-docker` verdes; `main` em estado de repouso válido — sem
    branch aberta, sem trava pela metade, sem exceção sem motivo escrito.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes do PR.
Depois da migration: `npm run db:lock` e, se houver Postgres nesta mesa, `npm run db:test:um
supabase/tests/storage_termo.sql`; se não houver (a mesa não tem Docker desde a F46), o
`banco-sem-docker` do PR é quem roda — e você **lê a saída dele** com `gh run view --log-failed` em
vez de supor. Leia a falha, corrija a **causa raiz** e repita até passar. **Não afrouxe trava, não
acrescente exceção para ficar verde, não troque lista branca por deny-list porque deu trabalho.**
Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

Provas obrigatórias, cada uma com a saída real em `docs/f50-evidencias/`:
- **A saída VERMELHA da frente 1** acusando `tipos-item.ts` e os demais arrastados — antes de declarar
  qualquer um. É a prova de que o tripwire novo enxerga o que o antigo não enxergava.
- **Sabotagem A:** acrescente `.from('senhas_acesso')` a um módulo da superfície; a lista branca acusa.
- **Sabotagem B:** acrescente `.rpc('alguma_coisa_nova')`; a lista branca de RPCs acusa.
- **Sabotagem C:** troque um call-site por `const c = acesso.client; …`; a trava acusa.
- **Sabotagem D:** crie um módulo novo em `queries/` com `client?: SupabaseClient<Database>` sem
  declará-lo; a superfície derivada acusa.
- **Sabotagem E:** faça uma tela de relatório importar um componente de `layout/` que tenha `href`
  externo; o confinamento derivado acusa (o de hoje **não** acusaria — mostre os dois).
- **Sabotagem F:** acrescente um quinto `const { data } = await` em `queries/`; a varredura acusa.
- **Sabotagem G:** ponha `podeCadastrar={filiais.length > 0}` num componente; a trava do `podeLer`
  acusa.
- **Sabotagem H:** acrescente `'empresa'` a `CampoFiltro`; o teste do hook acusa.
- **Sabotagem I (banco):** remova a chamada de `pode_ler_arquivo_termo` da policy e mostre
  `storage_termo.sql` reprovando; reverta.
- **`npm run build` limpo**, colado por inteiro.
- **O smoke** (`node scripts/smoke/smoke-prod.mjs`) depois do deploy, se o ambiente permitir — é ele
  que prova que a policy nova do bucket **não** tirou a leitura de ninguém. Se não permitir, diga no
  relatório e não finja.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem
espere confirmação em nenhuma hipótese. Régua, nesta ordem: (1) este prompt; (2) a ficha da F50 no §5
do plano; (3) as convenções do repositório (`CLAUDE.md`, código existente); (4) a opção mais simples e
reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto, escolha e motivo.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** em vez de repetir, e registre a troca.
Bloqueio real (MCP ausente, credencial recusada, produção inalcançável, mesa sem Postgres): contorne
se for seguro; senão, entregue o resto e registre a pendência com o que falta para resolvê-la — o
caminho da `0128`/`0129` e o do `db:types` já estão escritos assim de propósito. **Não mexa em
credencial, não invente caminho de apply alternativo, não force o classificador de segurança.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que a medição
esteja no relatório. Foi assim que a F46 trocou "aplicar duas vezes" por prova de determinismo, a F47
trocou 34 por 58, a F48 trocou 54 por 55 e a F49 trocou nove por dezenove.

# Git e segurança
Branch `f50-fronteira-da-leitura`, commits pequenos e frequentes, mensagens em pt-BR no padrão
conventional (`feat(f50): …`, `test(f50): …`, `docs(f50): …`, `fix(f50): …`). PR com `gh pr create`;
merge só com os dois checks verdes. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`,
`git clean -fd`, amend de commit que não é seu, commitar `.env*` ou dado real, mexer na branch
protection, apagar objeto de bucket, rodar roteiro SQL contra produção (os roteiros ESCREVEM, ainda
que em `begin; … rollback;` — regra permanente 5 do `CLAUDE.md`), ou escrever em produção fora dos
dois applies autorizados (`0128` e `0129`, pelo caminho A do runbook).

# Como trabalhar
Explore com subagentes paralelos — um por frente: (a) a superfície por assinatura, os 12 arquivos e
quem chama cada um com `acesso.client`, com as tabelas e RPCs de cada; (b) o grafo de imports das três
rotas de relatório e o que a superfície por pasta deixa de fora hoje; (c) as ~11 ocorrências de
`filiais.length`/`filiais[0]`, classificadas em autorização × ergonomia, uma a uma; (d) o par
Realtime/auto-refresh: as três montagens, o que cada tela precisa acordar, e se a consolidada depende
de insert de filial alheia; (e) o molde da `0069`/`0066` e o que a `0129` tem de espelhar, mais o que
`k_invoker_anon` e o `db:types:diff` cobram. Cada um volta só com resumo e com **NÚMEROS MEDIDOS**.
Escreva `docs/PLAN-F50.md` antes de implementar, com as contagens reais e as seis decisões já tomadas.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F50.md` e os 21
critérios, com estas perguntas: a superfície derivada é mesmo derivada, ou virou lista à mão com um
`readdirSync` por cima? alguma das quatro exceções nominais é isenção por categoria disfarçada de
motivo? a lista branca de tabelas cobre `.from()` escrito de outra forma (variável, template, `rpc`
com nome montado)? o confinamento derivado **contém** tudo o que a superfície por pasta continha, ou
troquei rede por furo? a catraca `SUPERFICIE_MINIMA` sobe sozinha ou alguém precisa mexer no número?
o `filter:` do realtime é provadamente total, ou é string mágica? o `ViewerAutoRefresh` deixou de
refrescar em algum caso em que o viewer PRECISA de dado novo? o `podeLer` mudou o que alguém vê hoje?
a `0129` tira a leitura de alguém — e o roteiro prova isso, ou só afirma? o `comment on function`
descreve o que a função faz de verdade? algum arquivo fora do escopo declarado foi tocado —
especialmente da F51, F57, F61, F67 e F70? **Aponte apenas lacunas de correção ou de requisito
declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F50.md`, em pt-BR, no padrão dos relatórios F45→F49: o que mudou por arquivo e por
quê; **os números MEDIDOS** (os 12 arquivos por assinatura e o destino de cada um, as tabelas e RPCs
das listas brancas, os 4 `const { data } = await`, as ~11 ocorrências de `filiais.length`
classificadas, as 3 montagens do `RealtimeRefresh`, o censo das 53 aparições de `ehOperador`), lado a
lado com o que a ficha previa, e **cada divergência explicada**; as seis decisões obrigatórias com o
custo que decidiu cada uma; as nove sabotagens com saída real, mais a **saída vermelha da frente 1**;
os 21 critérios autoverificados; o que este relatório **NÃO** prova (no mínimo: que tripwire de leitura
é teste de CÓDIGO, não de banco — o viewer continua rodando sob service_role e nenhuma RLS o segura;
que `SUPERFICIE_MINIMA` conta arquivos, não caminhos de execução; que a policy nova do bucket não
mudou quem lê **hoje**, e não diz nada sobre depois da virada; e que o Realtime continua sem trava no
Postgres, que é F70); pendências (a `0128` e a `0129`, se ficarem sem apply) e backlog nomeado para a
F51, a F61 e a F70 — com o `podeLer` de corpo, as chaves de storage e o filtro real do Realtime
**explicitamente carregados para lá**.
**Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final com um
resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de código, mensagens de erro, `comment on function` e
commits em **pt-BR**. Identificadores de domínio em português sem acento; utilitários e infra em
inglês. As mudanças do `registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa vocabulário de
desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~10 minutos)

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar. Se já houver falha,
#    o prompt precisa saber (acrescente uma linha dizendo qual).
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. O gh EXISTE (F45 §15) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 3. Esta fase MEXE NO BANCO. Se esta mesa tiver Docker/Supabase local,
#    suba antes — o ciclo da migration fica 20x mais barato do que por push:
supabase start          # se não existir, tudo bem: o banco roda no CI
npm run db:test         # se subiu, confira que os roteiros passam HOJE

# 4. A versão do Claude Code (o modo `auto` exige 2.1.83+).
claude --version
```

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` não está negado —
a fase abre PR e publica tag) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).

**Conecte o MCP do Supabase antes de colar, se ele estiver disponível.** É o que decide duas coisas
nesta fase: fechar a pendência da `0128` (aberta há três fases) e, principalmente, permitir o caminho
limpo da **Decisão 6** — aplicar a `0129` em produção e rodar `npm run db:types` para o `database.ts`
conhecer a função nova. Sem ele, a fase segue pelo hand-fix nominal, que é legítimo e tem precedente,
mas é o plano B.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f50
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda `npm ci`, `npm run db:lock`, `gh pr create`, `git tag`/`push` e
possivelmente dois applies de migration por MCP — nada disso passa numa allowlist estreita, e nada
disso é ação que o classificador bloqueia. O que ela **não** faz (push forçado, reset destrutivo,
apagar objeto de bucket, roteiro SQL contra produção, mexer na proteção da `main`) está no escopo
negativo do prompt.

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit passam limpos, fronteira-viewer.test.ts
deriva a superfície da assinatura e inclui queries/tipos-item.ts, confinamento-viewer.test.ts deriva do
grafo de imports com SUPERFICIE_MINIMA, a migration 0129 existe com db:lock rodado, e o PR está mergeado
com verificar e banco-sem-docker verdes
```

Sem colidir com trabalho local: `claude --worktree f50 --model opus --permission-mode auto` (aceite o
diálogo de confiança uma vez, antes).

### Enquanto roda

Esta fase é **mais cara em ciclo de CI do que a F49**: ela acrescenta migration e roteiro SQL, então o
`banco-sem-docker` (que aplica todas as migrations do zero em dois bancos e roda os roteiros mais o
injetor de mutações) entra no caminho crítico. Se a mesa não tiver Postgres, espere vários pushes — é
o esperado aqui, ao contrário da F49.

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Dois momentos para acompanhar:

1. **O primeiro run do `fronteira-viewer.test.ts` reescrito**: ele nasce **VERMELHO**, acusando
   `queries/tipos-item.ts` e os outros arrastados pela assinatura. Vermelho ali é a fase funcionando —
   é a prova de que o tripwire novo enxerga o que o antigo deixava passar há seis fases.
2. **O `db:types:diff` no `banco-sem-docker`**, depois que a `0129` entrar. Se ele reprovar, a
   Decisão 6 não foi resolvida — e é o único jeito de esta fase ficar presa sem o PR mergear.

### Ao voltar

1. Leia a **Decisão 1** na ata: o destino de `conflitos.ts`, `import-logs.ts` e `pendencias-detalhe.ts`.
   Se os três viraram exceção com o mesmo motivo genérico ("não é de relatório"), a trava está
   mentindo e a fase precisa voltar — a régua da casa é motivo **medido**, não categoria.
2. Leia a **Decisão 2**: se saiu filtro literal no Realtime, confira que ele é provadamente total. Um
   filtro errado não dá erro — ele faz o selo "ao vivo" mentir em silêncio. Abra duas abas em telas
   diferentes e confirme que uma escrita ainda acorda as duas.
3. Confira as sabotagens em `docs/f50-evidencias/` — em especial a **E** (o confinamento derivado
   pegando o que o de pasta não pegava) e a **I** (a policy do bucket). Trava provada em um caso só
   prova pouco.
4. `git diff main...f50-fronteira-da-leitura -- supabase/` deve mostrar **exatamente** a `0129`, o
   `storage_termo.sql`, o `k_invoker_anon` esvaziado e o lock. Objeto de bucket movido ou `empresa_id`
   em qualquer lugar = a fase invadiu a F67/F70.
5. Se a `0129` foi aplicada em produção: abra um termo pelo sistema e confirme que ele ainda baixa. É
   o teste de 30 segundos que nenhum roteiro substitui.
6. Rode você mesmo `npm run test` e `npm run build` uma vez.
7. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende a sessão — peça um
   prompt novo com o aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **F50 é a próxima fase e a F49 está fechada**: `main` limpa, `package.json` em 1.54.0, tag
   `v1.54.0` publicada, PR #32 mergeado, última migration `0128`. Se você tiver começado algo à mão, o
   prompt precisa de uma linha dizendo o quê.
2. **Decisão sua, 08/09/2026 — `podeLer`:** ele alcança **a paleta de comandos e mais nada** nesta
   fase. As 53 aparições de `ehOperador` na superfície de relatório viram censo escrito no relatório,
   para a F70 decidir. A trava contra derivar autorização de `filiais.length` entra do mesmo jeito.
3. **Decisão sua, 08/09/2026 — `ViewerAutoRefresh`:** escopo completo (pausa em aba oculta, um refresh
   ao voltar se o intervalo venceu, coalesce das rajadas). É a única mudança visível da fase.
4. **Decisão sua, 08/09/2026 — produção:** a fase tenta aplicar a `0128` e depois a `0129` se o MCP do
   Supabase estiver conectado, pelo caminho A do runbook, com verificação pós-apply; se não estiver,
   não insiste e carrega as duas pendências para o relatório.
5. **Versão 1.55.0** (fase = MINOR sobre 1.54.0), migration **`0129`**, matriz a partir de
   **R-ACC-40**. Se sair alguma correção avulsa antes desta fase, o agente recalcula a partir do
   `package.json`.
6. **A ficha da F50 no §5 do plano é o escopo.** As divergências que medi contra o disco de hoje —
   `anotacoes` sem `filial_id`; quatro arquivos arrastados pela regra da assinatura e não um; quatro
   `const { data } = await` e não um; `filiais.slug` ainda unique global (conserto preventivo);
   `SUPERFICIE_MINIMA` inexistente; `confinamento-viewer.test.ts` sendo o tripwire dos LINKS e não o
   irmão de leitura; os números de linha da paleta desatualizados pela F49 — estão no prompt como
   pontos a **confirmar antes de agir**, não como fatos a repetir.
7. **O `db:types:diff` é o risco real de a fase não mergear**, e ele não está na ficha. Tratei como
   Decisão 6 obrigatória, com os dois caminhos honestos escritos. Se você conectar o MCP, é o caminho
   (a) e some o problema.
8. **A mesa pode não ter Postgres/Docker** (registrado desde a F46). O prompt manda usar o
   `banco-sem-docker` do PR e ler a saída dele, em vez de supor — mas se você subir o Supabase local no
   pré-voo, a fase fica bem mais barata.
