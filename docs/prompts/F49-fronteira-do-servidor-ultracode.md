# F49 — A fronteira do servidor

*Ordem de serviço gerada em 08/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco B.*

**Por que ela existe.** O `CLAUDE.md` afirma, na seção de convenções, que regras críticas moram no
Postgres e que **"a UI é a segunda linha, nunca a única"**. A F48 enumerou a primeira linha do
BANCO — 55 policies, 37 `security definer`, as 8 de Storage e a publication do Realtime, todas
derivadas de catálogo. O relatório dela fechou nomeando o que ficou de fora: *"a superfície HTTP/RSC,
que é a F49"* (`RELATORIO-F48.md` §10). Esta fase vai atrás dela — e o que encontra é que, nas duas
camadas onde a frase do `CLAUDE.md` promete uma segunda linha, **a primeira não existe**:

- **nove Server Actions exportadas leem o acervo sem uma única guarda**, alcançáveis pela rede por
  qualquer sessão que tenha um cookie, ativa ou não;
- **23 dos 28 módulos de `src/lib/queries/` não declaram `server-only`** — e os **sete de
  `queries/relatorios/` estão 100% sem**, que são justamente os servidos ao visualizador por senha
  **com service role**, onde o RLS não é a segunda linha porque não é linha nenhuma.

**O ganho é imediato, com uma empresa só, e não é hipotético.** Um perfil DESATIVADO com cookie
ainda vivo — que `getOperador()` já expulsa de toda a UI — continua hoje enumerando patrimônio,
service tag, hostname, marca, modelo, nome de colaborador e **o nome da filial dona** por requisição
direta, até o token expirar. É exatamente o buraco que a F21 fechou em `exportar.ts`, com o motivo
escrito em doze linhas de comentário (`actions/exportar.ts:105-118`), e que
`buscarAtivosRecentesDoOperador` fechou no MESMO arquivo das nove, com a mesma justificativa ao lado
(`actions/movimentacoes.ts:866-872`). As nove ficaram para trás — e uma delas é a paleta de comandos,
o call-site mais quente do sistema.

**O que esta fase NÃO é.** Não é recorte de filial nas queries (é F57). Não é mudar o que uma query
faz. Não é o `podeLer` nem o tripwire do viewer reescrito (são F50). Não é migration — a última
continua sendo a `0128`, e a `0129` está reservada para a F50. É **fase só-código**: `git revert`
reverte tudo. Ela fecha duas fronteiras — a **HTTP** (Server Action exportada) e a **RSC** (módulo de
query alcançável pelo bundle do cliente) — e as trava por teste. **Nenhuma tela muda de aparência ou
de comportamento para quem tem perfil ativo.**

---

**Dez fatos de leitura do repositório, medidos em 08/09/2026, que a ficha do plano não tem.**

1. **A ficha diz "nove leituras sem guarda". Medi 18 exports sem guarda DIRETA no corpo**, e a
   diferença é o desenho inteiro da trava. São: as **nove** que a ficha nomeia (6 em
   `actions/movimentacoes.ts`, 3 em `actions/compras.ts`) ✔ confirmadas; as **quatro** de
   `actions/auth.ts`, que a ficha já manda nomear em `SEM_GUARDA` (públicas por desenho);
   **`senhas.ts::entrarComSenha`**, que a ficha **não menciona** e é igualmente pública por desenho —
   é a porta do visualizador, com rate-limit persistente por IP (`registrar_tentativa_senha`); e
   **quatro de `actions/exportar.ts` que ESTÃO guardadas** — via o helper local `barrado()`
   (`exportar.ts:118-122`), que chama `exigirPapel(supabase, 'consulta')`.
2. **Esses quatro de `exportar.ts` são a armadilha central desta fase.** Uma trava que leia só o
   corpo da função exportada produz **quatro falsos positivos no primeiro run**, e "resolvê-los"
   pondo-os em `SEM_GUARDA` seria escrever uma mentira num arquivo cuja razão de existir é não
   mentir. É a mesma classe de erro que a F47 arrancou do `seguranca_catalogo.sql` (isenção por
   prefixo sem motivo). Ou a trava resolve **um nível** de indireção local, ou os quatro passam a
   chamar a guarda direto. É decisão obrigatória, e tem de ficar registrada.
3. **A mitigação de desempenho que a ficha propõe JÁ EXISTE, e o instrumento que ela manda usar NÃO
   SERVE.** A ficha diz "se doer, resolver a sessão uma vez por request com `cache()` (padrão já
   usado em `acesso.ts:165`)" — mas `cargoDoRequest` (`acesso.ts:260`) já é `cache()` desde a F21,
   memoizado pela identidade do client, com 26 linhas de comentário explicando por quê. Não há
   segunda memoização a fazer. E a ficha manda medir com `scripts/perf/medir.mjs`, que é **só GET**
   por regra escrita no cabeçalho dele (linha 16: *"Nenhuma escrita, em nenhum ambiente. Nem POST,
   nem PATCH"*) — Server Action é POST, então ele **estruturalmente não alcança** a paleta nem o
   combobox. O custo real que sobra, e que ninguém mediu: **1 `auth.getUser()` + 1 `rpc('papel_atual')`
   por tecla digitada**, porque cada requisição de debounce é um request novo e o `cache()` só vale
   dentro de um.
4. **Não são três os call-sites com debounce por tecla. São sete, sobre seis das nove funções.**
   Medidos: `buscarAtivosParaMovimentacao` em `paleta-comandos.tsx:354` **e** em
   `ativo-combobox.tsx:110`; `buscarColaboradoresDoCampo` em `campo-colaborador.tsx:80`;
   `buscarSugestoesSetores` via `campo-sugerido.tsx:54`; e `buscarSugestoesMarca`/`Modelo`/`Fornecedor`
   via o `CampoComSugestoes` de `nova-compra-form.tsx:142`. Todos com o mesmo padrão: 300 ms de
   debounce, mínimo de 2 caracteres. As **três** restantes são de disparo único
   (`resolverPatrimoniosParaLote` no colar-lista, `buscarPossiveisDuplicatasDoDia` no passo Revisão,
   `buscarResumoDeAtivosPorIds` na restauração do rascunho).
5. **`buscarAtivosResumoPorIds` não tem teto nenhum** (`queries/ativos.ts:624-634`): `.in('id',
   unicos)` sobre a lista que o cliente mandar, sem limite. `MAX_LOTE_COMPRA` **vale 200** e mora em
   `@/lib/patrimonio` (não em `queries/compras.ts`), e é o teto que a ficha manda reusar.
6. **`prefixo-busca.ts` é 100% PURO e está na pasta errada.** Zero banco, zero client: só
   `MIN_PREFIXO_SUGESTAO` e `prefixoSeguro()`, com um cabeçalho de 14 linhas explicando que a
   neutralização de curinga é **regra de segurança**. É importado por `queries/colaboradores.ts`,
   `queries/movimentacoes.ts` e pelo próprio teste, que o importa **direto, como valor**. Pôr
   `server-only` nele quebra o teste; deixá-lo de fora da catraca abre a exceção logo no primeiro dia.
7. **Não são três os testes que precisam de `vi.mock('server-only')` — são quatro**, e os 68 outros
   imports **não precisam de nada**. Medi os imports de VALOR de `@/lib/queries/*` em teste:
   `queries/compras.test.ts`, `queries/itens.test.ts`, `queries/movimentacoes.test.ts` e
   `ajuda/conteudo/referencia.test.ts` (que puxa `MOV_PAGE_SIZE` e `GERADOS_PAGE_SIZE`). Os de
   `pendencias/filtro.test.ts` e `pendencias/rotulos.test.ts` **já têm o mock**. Todo o resto é
   `import type`, que o TypeScript apaga e que nunca chega ao runtime.
8. **A catraca "nenhum import de VALOR de `@/lib/queries` em módulo cliente" NASCE VERDE: 0 de 68.**
   Medi os 68 imports de `@/lib/queries` em módulos `'use client'` — **todos** são `import type`. A
   disciplina já é seguida à risca; o teste não conserta nada, ele impede que ela se perca em
   silêncio. E ele **tem de distinguir tipo de valor**, ou nasce com 68 falsos positivos.
9. **`createAdminClient()` tem 25 call-sites em 11 arquivos, não ~30.** E dos 11, um é a própria
   definição (`src/lib/supabase/admin.ts`) e um é teste (`actions/admin.test.ts`) — a superfície
   consumidora real são **9 arquivos**. Já `queries/admin.ts` tem **nove funções exportadas**, das
   quais **seis** tocam o client administrativo; a ficha diz "lê com service role em nove funções".
   Meça e escreva o número medido.
10. **A `0128` continua sem aplicar em produção** (`RELATORIO-F48.md` §12.1) — o MCP do Supabase não
    estava disponível na sessão da F48. Sintoma nomeado: produção tem 46 policies em `public` e o CI
    tem 47. Mesmo tratamento de sempre: tente se o acesso existir, e siga se não existir.

**Os métodos que continuam valendo:** o do §15 da F45 — *"comando não encontrado" é hipótese, não
conclusão* — e o da F47, que a F48 reconfirmou duas vezes: **número escrito na ficha se mede antes de
repetir.** Foram "34 asserções tautológicas" que viraram 58, "54 policies" que viraram 55, e agora
"nove leituras sem guarda" que são nove de dezoito.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Fechar as duas fronteiras do servidor — a HTTP e a RSC — e travá-las por teste, sem mudar o que
qualquer tela faz para quem tem perfil ativo. Ao final: as NOVE Server Actions de leitura hoje sem
guarda passam a exigir o piso da hierarquia (`exigirPapel(supabase, 'consulta')`), com a MESMA
degradação silenciosa que cada uma já pratica no `catch`, e `buscarResumoDeAtivosPorIds` ganha teto
por `MAX_LOTE_COMPRA`; todo módulo de `src/lib/queries/**` declara `import 'server-only'`;
`src/lib/actions/guardas-de-action.test.ts` reprova ao remover qualquer uma das nove;
`src/lib/queries/servidor-apenas.test.ts` é a catraca que só encolhe;
`src/lib/supabase/superficie-admin.test.ts` enumera cada call-site de `createAdminClient()` com
motivo escrito e a guarda que o protege; `queries/admin.ts` ganha o cabeçalho que o declara o
SEGUNDO módulo sem RLS; a paleta de comandos ganha a guarda e o cabeçalho que a declara superfície de
autorização paralela ao `sidebar-nav`; e o custo da guarda no caminho de debounce está MEDIDO, com
número, antes e depois. Versão **1.54.0** com tag publicada; PR mergeado com `verificar` e
`banco-sem-docker` verdes.
**Sem dependência nova, sem migration, sem recorte de filial, sem mudança de comportamento visível.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo e as 8 regras permanentes. A **1** (escopo da ordem
  atual — esta fase tem quatro fases vizinhas encostadas nela e é fácil invadir), a **3** (custo R$ 0,
  stack FECHADA — nenhum pacote novo, nem em `devDependencies`) e a **8** (versão) decidem metade das
  escolhas e não se reinterpretam. Leia com atenção redobrada, no mesmo arquivo, o parágrafo gigante
  do **modelo de acesso**: ele é a fonte de verdade em prosa do que as guardas fazem —
  `papel_atual()`, o **piso de leitura** (`papel_atual() is not null`: todo logado ATIVO lê tudo, e é
  a desativação que fecha), as cinco guardas de `src/lib/auth/acesso.ts`, e a frase que esta fase
  cobra: *"a UI é a segunda linha, nunca a única"*.
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns a TODAS as fases, que
  herdam para cá sem repetição — em especial a **2**, estado de repouso, e a **3**, escopo fora
  explícito), **§5 → F49** (a ficha: Objetivo / Entra / Não entra / Entregas / Pronto quando / Trava /
  Dependências / Risco / Reversão), **§5 → F50** e **§5 → F57** (para saber o que NÃO é seu: o
  `podeLer`, o tripwire do viewer, o Realtime, o recorte de filial) e **§3** ("F57 destrava F58 e a
  virada inteira").
  ⚠ **A ficha da F49 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem, vale
  a ficha, e a divergência vira nota no relatório. As divergências que já conheço estão em "O
  diagnóstico" abaixo — confirme cada uma antes de agir.
- `@docs/RELATORIO-F48.md` — é o estado de onde você parte, não história. Leia §10 (o que a F48 NÃO
  prova, onde a superfície HTTP/RSC é nomeada como sua), §12.1 (a pendência da `0128`) e §12.2 (o
  backlog — repare que a revogação do `EXECUTE` de `anon` das cinco funções INVOKER **é da F50**, com
  a migration `0129`; ela NÃO é sua).
- `@src/lib/auth/acesso.ts` — **leia o arquivo inteiro, comentários incluídos.** É o módulo mais
  importante desta fase e ele já resolveu, com o motivo escrito, três coisas que você vai querer
  resolver de novo: (a) `cargoDoRequest` (~linha 260) já é `cache()` por requisição, com 26 linhas
  explicando por que a chave é o CLIENT e por que memoizar o VÍNCULO mataria a revogação; (b)
  `getOperador` (~165) e o aviso de nunca trocar por `"use cache"`/`unstable_cache`; (c) `lerPapel`,
  que distingue "não tem papel" de "não deu para saber" — é ele que faz a guarda custar uma RPC.
- `@src/lib/actions/movimentacoes.ts` — as SEIS. E, no mesmo arquivo,
  **`buscarAtivosRecentesDoOperador` (~864-879): é o seu MOLDE, escrito e comentado.** Guarda no piso
  (`exigirPapel(supabase, 'consulta')`), `if (!aut.ok) return []`, degradação calada, e três linhas de
  comentário dizendo por que o piso e não `idOperador`. As nove nascem iguais a ela.
- `@src/lib/actions/exportar.ts`, linhas **105-122** — o helper `barrado()` e as doze linhas de
  comentário da F21 que explicam a doutrina inteira: leitura é ampla, a guarda é o PISO, e quem não
  atende é o perfil desativado. É o precedente que autoriza as nove; e é também a armadilha da trava
  (ver Decisão 1).
- `@src/lib/actions/compras.ts` — as três (`buscarSugestoesMarca`/`Modelo`/`Fornecedor`).
- `@src/lib/queries/prefixo-busca.ts` — leia o cabeçalho inteiro. Módulo PURO com regra de segurança
  dentro, na pasta errada, importado direto pelo próprio teste. É a Decisão 2.
- `@src/lib/auth/scrypt-senha.test.ts` (linhas 3-6) e `@src/lib/pendencias/rotulos.test.ts` (11-23) —
  a receita `vi.mock('server-only', () => ({}))` **já usada** neste repositório, com o comentário que
  explica por que ela existe. Não invente outra.
- `@src/lib/queries/relatorios/fronteira-viewer.test.ts` — leia o cabeçalho pelo TOM (é o modelo do
  cabeçalho que você vai escrever em `queries/admin.ts`) e não o toque: reescrevê-lo é da F50, e a
  ficha da F50 já diz que ele está desatualizado.
- `@src/lib/validators/catalogos-seguranca.test.ts` — a trava de mesa que a F48 escreveu, com as
  sabotagens que provam que ela sabe reprovar. É o molde estrutural das suas três travas novas.
- `@src/lib/ci-passos.test.ts` — o `describe 5` afirma que TODO `*.test.ts?(x)` do repositório está
  coberto por algum `include` do `vitest.config.mts`. Seus testes novos entram nessa varredura
  automaticamente; leia antes para nascer conforme.
- `@vitest.config.mts` — DOIS projetos desde a F45 (`puro`, ambiente `node`, e `componentes`). Seus
  testes novos são `.test.ts` e caem no `puro`.
- `@src/components/layout/paleta-comandos.tsx` — 614 linhas. O import da action está na **linha 42**;
  a busca com debounce, na **337-360**; o `{r.filial_nome}` no resultado, na **523**; e as flags de
  autorização de UI (`soAdmin`/`soDev`/`podeEscrever`) nas **72-76**, **399** e **408**.
- `@src/components/layout/permissoes.ts` — leia o cabeçalho, especialmente o aviso final ("esconder um
  botão é ergonomia, não segurança"). É o módulo que a F50 vai ampliar com `podeLer`; **você não o
  toca**, só aponta para ele.
- `@scripts/perf/medir.mjs` — leia o cabeçalho inteiro (linhas 1-40): as quatro regras que ele não
  quebra e o MÉTODO (aquecimento descartado, N rodadas em round-robin, mediana e p95 por
  interpolação). Seu harness novo herda o método e as quatro regras, **incluindo a de só-leitura**.
  Repare na cascata de credencial (`PERF_EMAIL`/`SMOKE_EMAIL`, linhas 114-127) — reuse, não invente.
- `@docs/MATRIZ-REGRAS.md`, seção **A6 — Acesso e segurança de dados (R-ACC)**. O último id em uso é
  **R-ACC-35** (emenda da F48). As emendas por fase ficam no fim do arquivo, cada uma com o "Contador
  desta matriz" atualizado — siga esse padrão.
- `@docs/ADR-002-papeis-e-permissoes.md` §4 — a doutrina da revogação no request seguinte, que é o
  motivo pelo qual a guarda vale a pena mesmo custando uma ida ao banco.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Nenhum item é para acreditar. Cada um tem uma consulta ou um comando que o confirma ou o derruba, e o
relatório registra o que VOCÊ mediu, inclusive quando bater com o que está escrito aqui.

1. **São 18 exports sem guarda direta, não nove.** Confirme varrendo os módulos `'use server'` de
   `src/lib/actions/` (pule os `*.test.ts` — `exportar-filtros.test.ts` contém a string `'use server'`
   e é teste). Os 18: as 9 da ficha, 4 de `auth.ts`, `senhas.ts::entrarComSenha` e **4 de
   `exportar.ts` que ESTÃO guardadas por `barrado()`**. Meça você mesmo antes de desenhar a trava.
2. **`entrarComSenha` é pública por desenho e a ficha não a nomeia.** Confirme lendo
   `senhas.ts:52-70` (rate-limit persistente por IP antes de qualquer coisa) e o parágrafo do
   visualizador no `CLAUDE.md`. Ela entra em `SEM_GUARDA` **nomeada, com motivo escrito** — nunca por
   categoria, nunca por prefixo.
3. **`cargoDoRequest` já é `cache()`** (`acesso.ts:260`) — a mitigação que a ficha propõe já está no
   ar desde a F21. Confirme lendo o comentário. Consequência: não há segunda memoização a fazer, e o
   custo que sobra é por REQUEST, não por chamada dentro do request.
4. **`scripts/perf/medir.mjs` é só GET** (cabeçalho, linha 16) e portanto **não mede Server Action**.
   Confirme. Consequência: o harness da frente 6 é NOVO, e o relatório diz por que o instrumento da
   ficha não servia.
5. **Sete call-sites com debounce por tecla, não três.** Confirme grepando as nove funções em
   `src/components/`; todos os campos usam 300 ms e mínimo de 2 caracteres.
6. **`buscarAtivosResumoPorIds` não tem teto** (`queries/ativos.ts:624`) e `MAX_LOTE_COMPRA` vale
   **200** e mora em `@/lib/patrimonio`. Confirme os dois.
7. **28 módulos em `queries/`, 5 com `server-only`, 7 em `relatorios/` sem nenhum.** Confirme
   contando. Se o número mudar porque você moveu `prefixo-busca.ts` (Decisão 2), escreva os DOIS
   números.
8. **Quatro testes importam VALOR de módulos de query que vão ganhar `server-only`**;
   `pendencias/filtro.test.ts` e `rotulos.test.ts` já têm o mock; todos os outros são `import type` e
   não precisam de nada. Confirme distinguindo `import type` de import de valor — não por grep de
   caminho.
9. **Zero imports de VALOR de `@/lib/queries` em módulo `'use client'` hoje; 68 são `import type`.**
   Confirme. A catraca da frente 4 nasce verde, e isso é para escrever no relatório com essas
   palavras: ela impede a regressão, não conserta nada.
10. **25 call-sites de `createAdminClient()` em 11 arquivos**, dos quais um é a definição e um é
    teste. Confirme e use o número medido.
11. **A `0128` não está em produção** (`RELATORIO-F48.md` §12.1). Confira se o MCP do Supabase está
    conectado nesta sessão antes de planejar qualquer apply.

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste`
- `npm run db:test` · `npm run db:test:mutations` · `npm run db:types:diff`
- `npm run verificar:actions` — leia o que ele faz antes de supor.
- `npm run db:lock` — **só** ao acrescentar migration. Esta fase não acrescenta.
- `node scripts/perf/medir.mjs` (rotas GET) e `node scripts/smoke/smoke-prod.mjs` (o smoke).
- `gh run watch` / `gh run view --log-failed` — o `gh` EXISTE nesta máquina (F45 §15); pode não estar
  no PATH da sessão.

# Escopo

## Dentro

### 1. As NOVE guardas — a fronteira HTTP
Acrescente `exigirPapel(supabase, 'consulta')` a cada uma das nove, **no molde exato de
`buscarAtivosRecentesDoOperador`** (mesmo arquivo, ~864): o piso da hierarquia, não `idOperador`,
porque os três cargos atendem por igual e quem NÃO atende é o perfil desativado. As nove:

| arquivo | função | caminho de recusa |
|---|---|---|
| `actions/movimentacoes.ts` | `buscarAtivosParaMovimentacao` | `return []` |
| `actions/movimentacoes.ts` | `resolverPatrimoniosParaLote` | a forma com `erro` que ela já usa |
| `actions/movimentacoes.ts` | `buscarColaboradoresDoCampo` | o `vazio` que ela já monta |
| `actions/movimentacoes.ts` | `buscarSugestoesSetores` | `return []` |
| `actions/movimentacoes.ts` | `buscarPossiveisDuplicatasDoDia` | `return []` |
| `actions/movimentacoes.ts` | `buscarResumoDeAtivosPorIds` | `return []` **+ teto** |
| `actions/compras.ts` | `buscarSugestoesMarca` | `return []` |
| `actions/compras.ts` | `buscarSugestoesModelo` | `return []` |
| `actions/compras.ts` | `buscarSugestoesFornecedor` | `return []` |

**A recusa usa a MESMA degradação que cada função já pratica no `catch`** — nenhuma delas passa a
lançar, nenhuma passa a devolver forma nova, nenhuma tela ganha mensagem de erro nova. Perfil ativo
não percebe diferença nenhuma; é isso que faz esta fase caber em "nada mudou de comportamento".
**O teto de `buscarResumoDeAtivosPorIds`** reusa `MAX_LOTE_COMPRA` (200, de `@/lib/patrimonio`) e vai
na ACTION, não na query — a query serve outros chamadores. Acima do teto, a mesma degradação calada,
com `console.error` no padrão dos vizinhos.

### 2. `import 'server-only'` em `src/lib/queries/**` — a fronteira RSC
Os 23 módulos que não declaram passam a declarar, `queries/relatorios/**` inclusive — são os sete que
o viewer alcança com service role e é onde a ausência custa mais. Depois: os quatro testes que
importam VALOR desses módulos ganham `vi.mock('server-only', () => ({}))` na receita já usada em
`scrypt-senha.test.ts`, **com comentário dizendo por quê** (o padrão do repositório é o motivo escrito,
não a linha nua). Os 68 `import type` não são tocados — o TypeScript os apaga.

### 3. `guardas-de-action.test.ts` — a trava da fronteira HTTP
`src/lib/actions/guardas-de-action.test.ts`: varre TODO módulo `'use server'` de `src/lib/actions/`
(pulando `*.test.ts`), extrai cada `export async function` e exige **uma das cinco guardas de
`src/lib/auth/acesso.ts`** (`exigirPapel`, `exigirAdmin`, `exigirDev`, `exigirEscrita`,
`exigirEscritaEm`) **ou** presença em `SEM_GUARDA: Record<'arquivo::função', motivo>`.
- `SEM_GUARDA` nasce com **cinco** entradas nomeadas — os 4 exports de `actions/auth.ts` e
  `senhas.ts::entrarComSenha` —, cada uma com o motivo POR ESCRITO. **As nove nascem corrigidas, não
  isentas**, e a trava reprova se alguma aparecer lá.
- O tratamento dos quatro de `exportar.ts` sai da **Decisão 1**.
- A trava tem de saber reprovar: sabotagem provada, com a saída colada.
- Ela é **catraca**: `SEM_GUARDA` só encolhe. Um teste que afirme o TAMANHO da lista (e reprove ao
  crescer) é a forma mais barata disso — escolha a sua e escreva o porquê.

### 4. `servidor-apenas.test.ts` — a trava da fronteira RSC
`src/lib/queries/servidor-apenas.test.ts`, com duas metades:
- **A catraca:** todo módulo de `src/lib/queries/**` declara `server-only`. Lista de exceções vazia,
  ou nominal com motivo escrito — e a contagem só encolhe.
- **A proibição:** nenhum módulo `'use client'` importa VALOR de `@/lib/queries/*`. **Distinga
  `import type` de import de valor** ou o teste nasce com 68 falsos positivos; especificador a
  especificador, porque `import { type A, b }` é import de valor. Diga no cabeçalho, com o número
  medido, que ela nasce verde e por que isso não a torna inútil.
- Sabotagem para cada metade, com a saída colada.

### 5. `superficie-admin.test.ts` e o cabeçalho de `queries/admin.ts`
`src/lib/supabase/superficie-admin.test.ts` enumera os call-sites de `createAdminClient()` e exige que
**cada ARQUIVO** esteja numa lista com **motivo escrito e a guarda que o protege** — nome da guarda,
não "é admin". Arquivo novo com `createAdminClient()` reprova. Na virada, essa lista é a agenda do
recorte fora da RLS, e é por isso que ela precisa nascer completa e com procedência.
E `src/lib/queries/admin.ts` ganha um **cabeçalho no tom do de `fronteira-viewer.test.ts`**,
declarando que este é o **SEGUNDO módulo sem RLS** do sistema: ele lê com service role, e o que ele lê
são **pessoas, não inventário** — `auth.admin.listUsers` enumera o projeto Auth inteiro (teto de
páginas na ~linha 46), e-mail, último login e situação de banimento incluídos. Escreva o número
medido de funções e de call-sites, e aponte para `superficie-admin.test.ts`.

### 6. A medição — o número que ninguém tem
Escreva `scripts/perf/medir-guarda.mjs`: **só leitura**, zero dependência nova (`fetch` do Node e
`@supabase/supabase-js`, que já é dependência), herdando de `scripts/perf/medir.mjs` as quatro regras
do cabeçalho e o método (aquecimento descartado → N rodadas em round-robin → mediana e p95). Ele mede,
com uma sessão de operador real obtida pela MESMA cascata de credencial do `medir.mjs`
(`PERF_EMAIL`/`SMOKE_EMAIL`…), três tempos: `auth.getUser()` isolado, `rpc('papel_atual')` isolado, e
o par — que é exatamente o que `exigirPapel` acrescenta a cada tecla. Saída em
`docs/perf/f49-guarda.json`, no formato do `docs/perf/*.json` existente: **tempo, status e tamanho —
nenhum dado real, nenhum id de produção, nenhum segredo, nem em stack trace**.
**Se não houver credencial utilizável no ambiente:** não invente nenhuma, não mexa em credencial —
meça o que der (o custo da RPC contra o banco do CI serve, com a limitação declarada) e escreva no
relatório qual ambiente você mediu e o que o número NÃO prova.
**A guarda entra de qualquer jeito** — fechar a enumeração de patrimônio ganha da latência, e é
decisão do Johnny de 08/09/2026. Se o número doer, isso é **ACHADO com proposta escrita** para a F60
(o custo do caminho quente), não motivo para parar nem para afrouxar.

### 7. A paleta de comandos — a guarda e o cabeçalho, e nada além
`src/components/layout/paleta-comandos.tsx` ganha a guarda **de graça**, pela action da frente 1. O
que você escreve nela é um **cabeçalho**, curto e verdadeiro, declarando três coisas: (a) que ela é o
call-site mais quente de `buscarAtivosParaMovimentacao` — debounce por tecla, em toda tela, para todo
logado; (b) que ela é uma **superfície de autorização de UI PARALELA ao `sidebar-nav`**
(`soAdmin`/`soDev`/`podeEscrever`, linhas 72-76, 399 e 408), e que `permissoes.ts` é onde essa
pergunta deveria morar; (c) que o **`podeLer` da F50 precisa alcançar ESTE arquivo**, com o ponto
exato marcado.
**Não mexa em mais nada da paleta.** O `{r.filial_nome}` da linha 523 **fica** — decisão do Johnny de
08/09/2026: tirá-lo mudaria o que o operador vê hoje e antecipa recorte que é da F57/F70. Não crie
`podeLer`, não toque em `permissoes.ts`, não escreva teste de componente para ela.

### 8. `prefixo-busca.ts` — a Decisão 2, executada antes da frente 2
Ver "As decisões obrigatórias". Qualquer que seja a escolha, ela acontece **antes** de você pôr
`server-only` em `queries/`, ou o `npm run test` fica vermelho por um motivo que não é o seu.

### 9. `docs/MATRIZ-REGRAS.md` — as regras escritas
Emenda F49 no fim do arquivo, no padrão das emendas F25/F26/F34/F48 (contador atualizado), a partir de
**R-ACC-36**: toda Server Action exportada tem guarda ou isenção nominal com motivo; todo módulo de
`lib/queries` declara `server-only`; módulo cliente não importa valor de `lib/queries`; todo
`createAdminClient()` tem arquivo declarado com motivo e guarda. Cada regra aponta o teste que a prova.

### 10. A `0128` em produção — tente, e siga se não der
Confira no começo se o MCP do Supabase está conectado. Se estiver: aplique
`supabase/migrations/0128_adota_bkp_relatorios_f6a.sql` pelo caminho A do `RUNBOOK-BANCO.md` e rode as
três consultas do bloco *VERIFICAÇÃO PÓS-APPLY* (a terceira tem de devolver **2**). Se não estiver:
**não insista, não invente caminho alternativo, não mexa em credencial** — carregue a pendência para o
relatório com o mesmo texto honesto da F47 e da F48, e siga.

### 11. O fechamento de sempre
`npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; entrada no
`CHANGELOG.md`; bump MINOR para **1.54.0** no `package.json`; entrada no topo de
`src/lib/versoes/registry.ts` (2 a 6 mudanças em LINGUAGEM DE OPERADOR — há teste que recusa
vocabulário de desenvolvedor); tag anotada `v1.54.0` publicada; ata em `docs/DECISOES.md`;
`docs/RELATORIO-F49.md`; PR mergeado com os dois checks verdes.

## Fora — não toque
- **Nenhum recorte de filial em query nenhuma.** É a F57, e é a fase de que a virada inteira depende.
  Guarda responde "pode ler?", nunca "pode ler O QUÊ".
- **Nenhuma mudança no que uma query FAZ.** Nenhum `select` novo, nenhuma coluna a mais ou a menos,
  nenhum filtro novo. Só o `import 'server-only'` no topo.
- **Nada da F50:** não crie `podeLer`, não toque em `src/components/layout/permissoes.ts`, não
  reescreva `fronteira-viewer.test.ts` nem `confinamento-viewer.test.ts`, não mexa em
  `realtime-refresh.tsx`, `viewer-auto-refresh.tsx`, `use-filtros-tabela.ts` nem em
  `queries/relatorios/comum.ts` (o `const { data } = await` que engole o erro é dela). **E não faça a
  revogação do `EXECUTE` de `anon` das cinco funções INVOKER** — decisão do Johnny de 08/09/2026: ela
  vai na `0129` da F50.
- **Nenhuma migration.** A última continua sendo a `0128`. Sem `npm run db:lock`.
- **Nenhum roteiro SQL novo nem alterado**, nenhuma mutação nova no injetor, nenhum job novo no
  `ci.yml`, nenhuma mudança na branch protection.
- Nenhuma dependência nova, nem em `devDependencies`. Nenhum recurso pago.
- Nenhum dado real: nome de colaborador, patrimônio ou linha de planilha da WAP não entra em fixture,
  teste, evidência, JSON de perf ou comentário. Tudo sintético (`WAP0001234` / "Fulano").
- Não "aproveite" para converter as outras leituras que já têm guarda, nem para uniformizar o estilo
  de degradação das actions, nem para mexer no `ativo-combobox` ou no `campo-colaborador` além do que a
  guarda exigir.
- Backlog herdado, e continua fora — entrega avulsa PATCH: o comentário morto em
  `scripts/gen-types.ts` (cita o job `banco`, removido na v1.51.1) e a exclusão `_%` em
  `supabase/ci/impressao-schema.sql`.

# A ordem de entrega não é livre
1. **Medir primeiro.** As 18, os 7 call-sites de debounce, os 28 módulos, os 68 imports de tipo, os 25
   call-sites de `createAdminClient()`. Um teste escrito a partir do número da ficha nasce errado.
2. **A medição da frente 6 vem ANTES da primeira guarda** — sem o "antes", não existe "depois", e o
   número é metade da entrega desta fase.
3. **Decisão 2 (`prefixo-busca`) executada**, então a frente 2 (`server-only` nos 23), então os quatro
   `vi.mock`. Nesta ordem, ou o `npm run test` fica vermelho pelo motivo errado.
4. **Decisão 1 tomada e registrada antes de escrever `guardas-de-action.test.ts`** — senão você escreve
   a trava, vê quatro falsos positivos e decide sob pressão.
5. **A trava (frente 3) ANTES das nove guardas.** Ela nasce vermelha nas nove, e é isso que prova que
   ela tem dentes; depois fica verde porque você corrigiu, não porque afrouxou. **Guarde a saída
   vermelha** — é evidência de relatório, não um estado intermediário a esconder (regra 4 do §4).
6. **As nove guardas**, em incrementos, com `npm run test` a cada um.
7. **A medição "depois"**, com o mesmo método e o mesmo ambiente da "antes".
8. **Frentes 4, 5 e 7** (catraca RSC, superfície admin, cabeçalho da paleta).
9. **Matriz, CHANGELOG, versão, tag e PR no fim.**

# As decisões obrigatórias — meça antes de decidir, registre em `docs/DECISOES.md`
**Decisão 1 — os quatro exports de `exportar.ts` guardados por helper local.** Eles chamam
`barrado()`, que chama `exigirPapel`. Uma trava que leia só o corpo do export dá quatro falsos
positivos. As opções sérias: **(a)** a trava resolve **um nível** de indireção local — reconhece
função do mesmo módulo que chame uma das cinco guardas e a trata como guarda; custo: a trava fica mais
esperta e precisa de sabotagem própria provando que não vira peneira (uma indireção de DOIS níveis,
ou uma função homônima, ainda reprova?). **(b)** os quatro passam a chamar `exigirPapel` direto e
`barrado()` morre; custo: mexe em código que está correto, e o comentário de doze linhas da F21 tem de
migrar junto. **(c)** os quatro entram em `SEM_GUARDA`; **esta não é opção** — seria escrever no
arquivo que eles não têm guarda quando têm, e é a classe de mentira que a F47 arrancou deste
repositório. Decida entre (a) e (b), com o custo medido, e escreva o porquê.

**Decisão 2 — onde mora `prefixo-busca.ts`.** Ele é puro, tem regra de segurança dentro, está em
`queries/` e o teste o importa direto como valor. Opções: **(a)** move para fora de `queries/` (é o
que a ficha sugere com "a parte pura extraída antes"): a pasta `queries/` volta a significar "toca o
banco", a catraca da frente 4 fica sem exceção, o teste continua importando direto, e o custo são dois
imports reescritos (`queries/colaboradores.ts:6` e `queries/movimentacoes.ts:20`) e um caminho novo
escolhido com critério. **(b)** fica onde está e o teste ganha `vi.mock('server-only')`: custo zero
hoje, e a catraca nasce com um módulo que declara `server-only` sem precisar. **Não faça as duas.**
Decida, e o cabeçalho do arquivo registra a escolha.

**Decisão 3 — o que acontece se a medição doer.** Sua régua, e ela vale para os sete call-sites de
debounce: a guarda **fica**, o número vai para o relatório como MANCHETE, e a proposta de mitigação
(se houver) vai escrita para a F60, sem código. O que não se faz é remover a guarda de um caminho
"porque é quente", nem trocá-la por `idOperador()` — que responde "existe sessão?" e **nunca** "pode
fazer isso?", como o `CLAUDE.md` diz com essas palavras.

# A trava
`guardas-de-action.test.ts` (reprova ao remover qualquer uma das nove; `SEM_GUARDA` só encolhe),
`servidor-apenas.test.ts` (catraca do `server-only` + proibição de import de valor em módulo cliente)
e `superficie-admin.test.ts` (todo `createAdminClient()` com arquivo declarado, motivo e guarda). As
três rodam **sem banco**, na mesa, o que torna o ciclo desta fase barato — ao contrário das três
anteriores. `ci-passos.test.ts` cobra a cobertura delas pelo runner, e `npx tsc --noEmit` é a quarta
trava, de graça: `server-only` importado por engano num módulo cliente quebra o `npm run build`.

# Critérios de aceitação — autoverifique item a item e cole a evidência de cada um
1. As nove actions têm `exigirPapel(supabase, 'consulta')`, com a degradação de recusa idêntica à que
   cada uma já praticava — nenhuma passa a lançar, nenhuma muda de forma de retorno.
2. `buscarResumoDeAtivosPorIds` recusa lote acima de `MAX_LOTE_COMPRA` (200), com o mesmo padrão de
   log dos vizinhos.
3. `guardas-de-action.test.ts` existe, varre todo módulo `'use server'`, e **reprova ao remover
   qualquer uma das nove** — provado por sabotagem, com a saída colada.
4. `SEM_GUARDA` tem exatamente as cinco entradas nominais (4 de `auth.ts` + `entrarComSenha`), cada uma
   com motivo escrito; nenhuma das nove está lá; a lista só encolhe, e há teste que prova isso.
5. A Decisão 1 está tomada, registrada e aplicada; se foi a (a), há sabotagem provando que a trava não
   vira peneira com indireção de dois níveis.
6. Todo módulo de `src/lib/queries/**` declara `server-only` — o número medido está no relatório, com
   os sete de `relatorios/` nomeados.
7. `servidor-apenas.test.ts` existe, com as duas metades, distinguindo `import type` de import de
   valor; as duas sabotagens estão coladas; o cabeçalho diz que a segunda metade nasce verde e por quê.
8. A Decisão 2 está tomada, registrada e aplicada; `prefixo-busca` está num lugar só e o `npm run
   test` passa sem exceção nova.
9. Os quatro testes que importam valor de módulo de query ganharam `vi.mock('server-only')` com
   comentário; nenhum `import type` foi tocado.
10. `superficie-admin.test.ts` enumera os call-sites medidos de `createAdminClient()`, cada ARQUIVO
    com motivo e a guarda nomeada; arquivo novo reprova — provado por sabotagem.
11. `queries/admin.ts` traz o cabeçalho declarando o segundo módulo sem RLS, com os números medidos e
    o ponteiro para `superficie-admin.test.ts`.
12. `paleta-comandos.tsx` traz o cabeçalho com as três declarações da frente 7 e o ponto marcado para o
    `podeLer` da F50 — e **nenhuma outra mudança** (o `filial_nome` da 523 continua lá; `git diff` do
    arquivo cabe numa tela).
13. `scripts/perf/medir-guarda.mjs` existe, é só-leitura, sem dependência nova, e
    `docs/perf/f49-guarda.json` traz **antes e depois** com mediana e p95 — ou, na falta de credencial,
    o que foi medido e a limitação declarada.
14. O relatório traz o custo da guarda **em milissegundos**, por tecla, com o método, e diz se ele dói
    ou não — com a proposta para a F60 se doer.
15. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos; nenhum roteiro SQL
    alterado; `git diff` mostra **zero** arquivos em `supabase/`.
16. `npm run db:test` e `npm run db:test:mutations` continuam verdes no CI, sem nada de novo (esta
    fase não toca o banco — se algum mudar, algo saiu do escopo).
17. `docs/MATRIZ-REGRAS.md` traz a emenda F49 a partir de R-ACC-36, com o teste que prova cada regra e
    o contador atualizado.
18. Versão **1.54.0** no `package.json` e no topo do `registry.ts` (linguagem de operador), tag
    `v1.54.0` anotada e publicada, entrada no `CHANGELOG.md`.
19. PR mergeado com `verificar` e `banco-sem-docker` verdes; `main` num estado de repouso válido — sem
    branch aberta, sem guarda pela metade, sem exceção sem motivo escrito.

# Verificação — rode de verdade
Esta fase, ao contrário das três anteriores, **verifica-se quase toda na mesa**: as três travas novas
rodam sem banco. A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; e
`npm run build` antes do PR — ele é o que pega `server-only` alcançando bundle de cliente, e é uma
trava de graça que você não deve pular por pressa. Leia a falha, corrija a CAUSA RAIZ e repita até
passar. **Não afrouxe trava, não acrescente exceção para ficar verde, não remova guarda de caminho
quente.** Falha persistindo depois de ~3 ciclos: mude de abordagem e registre a troca.

Provas obrigatórias, cada uma com a saída real em `docs/f49-evidencias/`:
- **Sabotagem A:** remova a guarda de uma das nove e mostre `guardas-de-action.test.ts` acusando pelo
  nome da função; reverta. Repita pondo a função em `SEM_GUARDA` — tem de continuar reprovando.
- **Sabotagem B:** acrescente um `export async function` novo sem guarda a um módulo `'use server'` e
  mostre a trava acusando; reverta.
- **Sabotagem C** (só se a Decisão 1 for a (a)): indireção de DOIS níveis, ou helper homônimo sem
  guarda, e mostre que a trava não engole; reverta.
- **Sabotagem D:** remova `server-only` de um módulo de `queries/` e mostre a catraca acusando;
  reverta.
- **Sabotagem E:** troque um `import type` por import de valor num módulo `'use client'` e mostre a
  proibição acusando **e** o `npm run build` quebrando; reverta.
- **Sabotagem F:** acrescente `createAdminClient()` a um arquivo não declarado e mostre
  `superficie-admin.test.ts` acusando; reverta.
- **A saída VERMELHA da frente 3 antes das nove correções** — a prova de que a trava tinha dentes.
- **`npm run build` limpo**, colado por inteiro: é ele que prova a fronteira RSC de ponta a ponta.
- **O smoke** (`node scripts/smoke/smoke-prod.mjs`) depois do deploy, se o ambiente permitir: prova
  que nenhuma tela regrediu. Se não permitir, diga no relatório.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem
espere confirmação em nenhuma hipótese. Régua, nesta ordem: (1) este prompt; (2) a ficha da F49 no §5
do plano; (3) as convenções do repositório (`CLAUDE.md`, código existente); (4) a opção mais simples e
reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto, escolha e motivo.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** em vez de repetir, e registre a troca.
Bloqueio real (MCP ausente, credencial recusada, produção inalcançável): contorne se for seguro;
senão, entregue o resto e registre a pendência com o que falta para resolvê-la — o caminho da `0128` e
o da medição sem credencial já estão escritos assim de propósito. **Não mexa em credencial, não invente
caminho de apply alternativo, não force o classificador de segurança.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que a medição
esteja no relatório. Foi assim que a F46 trocou "aplicar duas vezes" por prova de determinismo, a F47
trocou 34 por 58 e a F48 trocou 54 por 55.

# Git e segurança
Branch `f49-fronteira-do-servidor`, commits pequenos e frequentes, mensagens em pt-BR no padrão
conventional (`feat(f49): …`, `test(f49): …`, `docs(f49): …`, `fix(f49): …`). PR com `gh pr create`;
merge só com os dois checks verdes. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`,
`git clean -fd`, amend de commit que não é seu, commitar `.env*` ou dado real, mexer na branch
protection, escrever qualquer coisa em produção fora do apply da `0128`.

# Como trabalhar
Explore com subagentes paralelos — um por frente: (a) as 18 actions, o corpo de cada uma e o caminho
de degradação que cada uma já pratica; (b) os 28 módulos de `queries/`, quem os importa e os quatro
testes de valor; (c) os módulos `'use client'` e a diferença tipo × valor, com o número; (d) os
call-sites de `createAdminClient()` e a guarda que protege cada arquivo; (e) o caminho quente — os
sete call-sites de debounce e o que `exigirPapel` custa de verdade. Cada um volta só com resumo e com
NÚMEROS MEDIDOS. Escreva `docs/PLAN-F49.md` antes de implementar, com as contagens reais e as três
decisões já tomadas.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F49.md` e contra os
19 critérios, com estas perguntas: alguma das nove guardas mudou o que o usuário ATIVO vê (mensagem
nova, forma de retorno nova, exceção que atravessa)? a trava de guardas passa se eu puser a guarda num
comentário, numa string, ou num ramo inalcançável? ela reprova de verdade ao remover cada uma das
nove, uma a uma, ou só a primeira que testei? alguma entrada de `SEM_GUARDA` é isenção por categoria
disfarçada de motivo? a catraca de `server-only` tem exceção sem motivo escrito? a proibição de import
de valor confunde `import { type A, b }` com `import type`? a lista de `createAdminClient()` nomeia
guarda que existe, ou repete "é admin"? o cabeçalho da paleta afirma alguma coisa que o código não
faz? a medição "antes" e "depois" usou o mesmo ambiente e o mesmo método, ou compara coisas
diferentes? algum arquivo fora do escopo declarado foi tocado — especialmente da F50 e da F57?
**Aponte apenas lacunas de correção ou de requisito declarado — não preferências de estilo.** Corrija e
re-revise até limpar.

# Relatório final
`docs/RELATORIO-F49.md`, em pt-BR, no padrão dos relatórios F45/F46/F47/F48: o que mudou por arquivo e
por quê; **os números MEDIDOS** (18 exports sem guarda direta e sua composição, 28 módulos de query,
68 imports de tipo, call-sites de `createAdminClient()`, call-sites de debounce), lado a lado com os
que a ficha previa, e cada divergência explicada; as três decisões obrigatórias com o custo que
decidiu cada uma; **a medição da guarda, com método, ambiente, mediana e p95, antes e depois — e o
veredito honesto sobre se ela dói**; as seis sabotagens com saída real, mais a saída vermelha da trava
antes das correções; os 19 critérios autoverificados; o que este relatório NÃO prova (no mínimo: que
guarda de action é a SEGUNDA linha e não a primeira — a primeira continua sendo a RLS, e as nove
leem tabelas cujas policies de SELECT seguem `using (true)` por desenho; e que `server-only` protege o
bundle, não a rede); pendências (a `0128`, se continuar aberta) e backlog nomeado para a F50 — com a
revogação do `EXECUTE` de `anon` das cinco funções INVOKER **explicitamente carregada para lá**.
**Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final com um
resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de código, mensagens de erro e commits em **pt-BR**.
Identificadores de domínio em português sem acento; utilitários e infra em inglês. As mudanças do
`registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa vocabulário de desenvolvedor.
```

---

## Como executar

### Pré-voo (uma vez, ~10 minutos)

```powershell
cd C:\Users\yukig\ti-wap-inventory-control
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar — se já houver falha,
#    o prompt precisa saber disso (acrescente uma linha dizendo qual).
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. O gh EXISTE (F45 §15) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 3. A CREDENCIAL DA MEDIÇÃO — o que muda mais o resultado desta fase.
#    O harness novo reusa a cascata do medir.mjs. Confira se existe .env.local
#    com PERF_EMAIL/PERF_SENHA (ou SMOKE_EMAIL/SMOKE_SENHA):
Select-String -Path .env.local -Pattern "PERF_EMAIL|SMOKE_EMAIL" -SimpleMatch
#    Se NÃO houver, o prompt já trata (mede o que der e declara a limitação),
#    mas a fase entrega um número mais fraco. Se você tiver a credencial de
#    smoke à mão, ponha no .env.local ANTES de colar.

# 4. A versão do Claude Code (o modo `auto` exige 2.1.83+).
claude --version
```

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` não está negado —
a fase abre PR) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado; o parágrafo do modelo de
acesso é insumo direto das nove guardas).

**Se o MCP do Supabase estiver disponível, conecte-o antes de colar** — é o que permite fechar a
pendência da `0128`, aberta desde a F47. Se não estiver, o prompt trata a ausência e segue.

### Rodar

```powershell
claude --model opus --permission-mode auto -n f49
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda `npm ci`, `gh pr create`, `git tag`/`push`, um script de medição
contra a produção (só leitura) e possivelmente o apply da `0128` — nada disso passa numa allowlist
estreita, e nada disso é ação que o classificador bloqueia. O que ela **não** faz (push forçado, reset
destrutivo, escrita em produção, mexer na proteção da `main`) está no escopo negativo do prompt.

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit passam limpos, as nove actions têm
guarda, guardas-de-action.test.ts reprova ao remover qualquer uma delas, todo módulo de lib/queries
declara server-only, a medição antes/depois está em docs/perf/f49-guarda.json e o PR está mergeado com
os dois checks verdes
```

Sem colidir com trabalho local: `claude --worktree f49 --model opus --permission-mode auto` (aceite o
diálogo de confiança uma vez, antes).

### Enquanto roda

**Esta fase é a mais barata das quatro do Bloco A/B em ciclo de CI** — as três travas novas rodam na
mesa, sem Postgres, e o `npm run build` pega a fronteira RSC localmente. Espere poucos pushes, não
vários. Se você vir a run empurrando ciclo atrás de ciclo para o GitHub, algo saiu do trilho: é sinal
de que ela está tentando mexer em banco, e isso está fora do escopo.

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

O momento a acompanhar é o **primeiro run de `guardas-de-action.test.ts`**: ele nasce VERMELHO de
propósito, acusando as nove. Vermelho ali é a fase funcionando.

### Ao voltar

1. Vá direto ao número: **quanto custou a guarda por tecla**, em `docs/RELATORIO-F49.md` e em
   `docs/perf/f49-guarda.json`. É a notícia desta fase e é o insumo da F60.
2. Confira o `git diff` de `paleta-comandos.tsx` — pela ordem, ele cabe numa tela e é só cabeçalho. Se
   vier maior, a fase invadiu a F50.
3. `git diff main...f49-fronteira-do-servidor --stat -- supabase/` **tem de vir vazio.** Esta fase não
   toca o banco.
4. Leia as três decisões na ata. A Decisão 1 (os quatro de `exportar.ts`) é a que mais diz sobre a
   qualidade da trava: se a resposta foi "entraram em SEM_GUARDA", a trava está mentindo e a fase
   precisa voltar.
5. Confira as sabotagens em `docs/f49-evidencias/` — em especial a A repetida nas nove, uma a uma.
   Trava que só foi provada numa função prova pouco.
6. Rode você mesmo `npm run build` e `npm run test` uma vez. E, se der, o smoke.
7. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende a sessão — peça um
   prompt novo com o aprendizado e rode em sessão limpa.

---

## Suposições que fiz

1. **F49 é a próxima fase e a F48 está fechada** (`main` em `v1.53.0`, PR #30 mergeado, nada em
   andamento). Se você tiver começado algo à mão, o prompt precisa de uma linha dizendo o quê.
2. **Decisão sua, 08/09/2026 — desempenho:** a guarda entra nos nove caminhos de qualquer jeito; a fase
   escreve um harness novo de só-leitura (`scripts/perf/medir-guarda.mjs`) porque o `medir.mjs` é só
   GET e não alcança Server Action; se o número doer, vira achado com proposta para a F60, não motivo
   para parar.
3. **Decisão sua, 08/09/2026 — paleta:** só a guarda e o cabeçalho que a declara superfície de
   autorização. O `{r.filial_nome}` da linha 523 **fica**; `podeLer` é da F50.
4. **Decisão sua, 08/09/2026 — achado 8.2 da F48:** a revogação do `EXECUTE` de `anon` das cinco
   funções INVOKER fica para a F50, junto com a `0129`. O prompt da F49 carrega o item como backlog
   nomeado para o relatório, para o prompt da F50 não perder.
5. **A ficha da F49 no §5 do plano é o escopo.** As divergências que medi (18 exports sem guarda
   direta e não nove; os quatro de `exportar.ts` guardados por helper; sete call-sites de debounce e
   não três; quatro testes precisando de `vi.mock` e não três; a catraca de import de cliente nascendo
   verde em 0 de 68; 25 call-sites de `createAdminClient()` e não ~30) são divergências da ficha com o
   repositório de hoje — o prompt manda confirmar cada uma antes de agir.
6. **Versão 1.54.0** (fase = MINOR sobre 1.53.0). Se sair alguma correção avulsa antes desta fase, o
   número muda e o agente recalcula a partir do `package.json`.
7. **A credencial de perf/smoke pode não estar no ambiente.** O prompt trata a ausência sem travar,
   mas o número fica mais fraco — vale conferir o `.env.local` no pré-voo.
