# Relatório F49 — A fronteira do servidor

**Data:** 07/09/2026 · **Versão:** v1.54.0 · **Branch:** `f49-fronteira-do-servidor`
**Escopo:** fechar a fronteira HTTP (Server Action é endpoint) e a fronteira RSC (módulo de
servidor no bundle do cliente), e travar as duas por teste — sem mudar o que qualquer tela faz
para quem tem perfil ativo.

**Sem migration, sem roteiro SQL, sem dependência nova, sem recorte de filial.**
`git diff main --stat -- supabase/` devolve vazio.

---

## 1. O que estava aberto

Uma Server Action exportada **é um endpoint HTTP**. O Next lhe dá um id e ela atende POST
direto, sem passar por tela nenhuma. Esconder o botão é ergonomia — `permissoes.ts` diz isso
por escrito, e o `CLAUDE.md` diz a versão geral: *"a UI é a segunda linha, nunca a única"*.

Nove leituras não perguntavam nada. Quem tivesse um token válido e o perfil **DESATIVADO** —
expulso de toda a UI por `getOperador()`, e ainda assim aceito pelo PostgREST até o token
expirar — enumerava patrimônio, modelo, marca, fornecedor, nome de colaborador e setor por
request direto. As policies de SELECT dessas tabelas seguem o piso `papel_atual() is not null`
(R-ACC-32), que é por desenho; a segunda linha, nesses nove caminhos, simplesmente não existia.

O precedente já estava escrito no próprio repositório, desde a F21, em `actions/exportar.ts`:
doze linhas explicando por que a guarda de export deixou de ser "existe sessão?" e virou
`exigirPapel('consulta')`. A F49 aplicou a mesma doutrina onde ela faltava.

---

## 2. Os números MEDIDOS, lado a lado com os que a ficha previa

Nenhum número abaixo foi copiado da ordem de serviço. Cada um foi medido contra o disco, e
cinco divergiram.

| O que | A ficha dizia | **Medido** | Divergência |
|---|---|---|---|
| Exports em módulos `'use server'` | 88 | **89** | +1: há um módulo `'use server'` **fora** de `src/lib/actions/` |
| Exports sem guarda direta | 18 | **19** | +1: faltava `senhas.ts::sairVisualizacao` |
| Isenções nominais (`SEM_GUARDA`) | 5 | **6** | +1, pelo mesmo motivo |
| Módulos em `lib/queries` | 28 (5 com `server-only`) | **28 → 27** (5 com) | 27 depois de `prefixo-busca.ts` sair da pasta (Decisão 2) |
| Módulos de `queries/relatorios/` sem `server-only` | 7 | **7** | confere |
| Módulos `'use client'` | — | **170** | 169 pela âncora de linha **+ 1 com BOM** |
| Imports de `@/lib/queries` em módulo cliente | 68, todos de tipo | **67**, todos de tipo | −1 |
| Invocações de `createAdminClient()` | 25 em 11 arquivos | **22 em 8 arquivos** | as 25 contavam imports, comentários e uma anotação de tipo; os 11 contavam a definição, um arquivo só-comentário e um teste |
| Call-sites com debounce por tecla | 7, todos 300 ms / mín. 2 | **6**, sendo 5 a 300 ms / mín. 2 | o sexto (`com-esta-pessoa-devolucao.tsx:46`) usa **400 ms** e não tem piso de 2 caracteres — e a action que ele chama **já tinha** guarda |
| `MAX_LOTE_COMPRA` | 200, em `@/lib/patrimonio` | **200**, `patrimonio.ts:8` | confere |
| `cargoDoRequest` já é `cache()` | sim, `acesso.ts:260` | **sim**, linha 260 | confere |
| `medir.mjs` é só GET | sim | **sim** (regra escrita na linha 16) | confere |

**Composição dos 19 sem guarda direta:** as 9 da ficha + 4 de `auth.ts` + `entrarComSenha` +
`sairVisualizacao` + **4 de `exportar.ts` que ESTÃO guardados**, por `barrado()` — indireta de
um nível, que a trava passou a reconhecer (Decisão 1).

---

## 3. O que mudou, por arquivo

### 3.1 As nove guardas — `actions/movimentacoes.ts` e `actions/compras.ts`

Todas ganharam `exigirPapel(supabase, 'consulta')` — o **piso** da hierarquia, não
`idOperador`, porque os três cargos atendem por igual e quem não atende é o perfil desativado.
`idOperador` responde *"existe sessão?"*, nunca *"pode fazer isso?"* — o `CLAUDE.md` usa essas
palavras, e a trava o exclui da lista de guardas de propósito.

A recusa de cada uma devolve **exatamente o que o `catch` daquela função já devolvia**:

| função | recusa devolve | é o mesmo do `catch`? |
|---|---|---|
| `buscarAtivosParaMovimentacao` | `[]` | sim |
| `resolverPatrimoniosParaLote` | `{ ...resolucaoVazia(), erro: aut.erro, invalidos }` | mesma **forma**; a mensagem é a do cargo, e só quem foi recusado a vê |
| `buscarColaboradoresDoCampo` | `vazio` | sim (o mesmo objeto do piso de 2 chars e do catch) |
| `buscarSugestoesSetores` | `[]` | sim |
| `buscarPossiveisDuplicatasDoDia` | `[]` | sim (ela é aviso, não trava) |
| `buscarResumoDeAtivosPorIds` | `[]` | sim |
| as 3 de `compras.ts` | `[]`, dentro de `sugerir()` | sim |

Nenhuma passou a lançar. Nenhuma mudou de tipo de retorno. Nenhuma tela ganhou mensagem nova.

**A ordem dentro da função importa, e é deliberada:** onde já havia piso de caracteres
(`< 2` em `buscarColaboradoresDoCampo` e `buscarSugestoesSetores`; `MIN_CHARS_SUGESTAO` em
`sugerir()`), a guarda vem **depois** dele. Abaixo do piso a função já devolvia vazio sem tocar
o banco — não há o que proteger, e adiantar a guarda custaria uma ida ao Supabase **a cada
tecla** digitada antes da segunda letra, no caminho mais quente do sistema.

**O teto de `buscarResumoDeAtivosPorIds`:** ela recebe uma lista de ids **vinda do cliente** e
devolve o resumo de cada um. Sem teto, uma chamada podia pedir o acervo inteiro, e o "rascunho"
virava o caminho barato de dump. O teto é `MAX_LOTE_COMPRA` (200) — a constante que o sistema
já usa para lote, em vez de um segundo número para a mesma ideia — e vai na **action**, não na
query, porque `buscarAtivosResumoPorIds` serve outros chamadores que não vêm da rede.

### 3.2 `import 'server-only'` — 22 módulos, 27 de 27 agora

Os sete de `queries/relatorios/**` são os que mais importavam e os que menos tinham: nenhum
declarava nada, e são exatamente os que o **visualizador por senha** percorre com service role,
onde a RLS não é a segunda linha (o tripwire deles é `fronteira-viewer.test.ts`, que **não foi
tocado** — reescrevê-lo é da F50).

Nos 22 arquivos, a mudança é **uma linha no topo e nada mais**: nenhum `select`, coluna ou
filtro mudou.

### 3.3 As três travas

- **`src/lib/actions/guardas-de-action.ts` + `.test.ts`** — a fronteira HTTP. Varre o `src/`
  **inteiro** e cobra de cada export uma das cinco guardas ou isenção nominal com motivo
  escrito. Reusa `ehModuloUseServer` e o neutralizador `limpar` de `use-server-exports.ts`
  (que passou de local a exportada) — é isso que faz um `exigirPapel` citado num comentário ou
  dentro de uma string **não contar**. 26 casos.
- **`src/lib/queries/servidor-apenas.test.ts`** — a fronteira RSC, em duas metades: a catraca
  do `server-only` (27 de 27, `DISPENSADOS` vazia) e a proibição de import de **valor** de
  `@/lib/queries` em módulo `'use client'`. 52 casos.
- **`src/lib/supabase/superficie-admin.test.ts`** — o censo do service role: 22 invocações em
  8 arquivos, cada **arquivo** com motivo e o **nome** do mecanismo que o protege. 13 casos.

As três rodam **sem banco**, o que tornou o ciclo desta fase barato — ao contrário das três
anteriores, em que cada calibragem custava um push e a leitura do job de CI.

### 3.4 Os cabeçalhos

- **`src/lib/queries/admin.ts`** — declarado o **SEGUNDO módulo sem RLS** do sistema. Das 9
  funções exportadas, seis chegam ao service role (cinco diretamente, `listarUsuarios` pelo
  helper `lerContasAuth`), e o que ele lê são **pessoas, não inventário**:
  `auth.admin.listUsers` enumera o projeto Auth inteiro, página a página, até
  `AUTH_PAGINAS_MAX × AUTH_POR_PAGINA` = 50 × 200 = 10 mil contas, com e-mail, último login e
  situação de banimento.
- **`src/components/layout/paleta-comandos.tsx`** — 33 linhas, **zero removidas**, nenhuma
  linha de código alterada. Declara as três coisas pedidas: que é o call-site mais quente da
  action guardada (300 ms, mín. 2 caracteres, em toda tela, para todo logado); que é uma
  superfície de autorização de UI **paralela** ao `sidebar-nav`, cujo lugar próprio seria
  `permissoes.ts`; e o ponto exato em que o `podeLer` da F50 precisa entrar. O
  `{r.filial_nome}` continua na linha 556.

### 3.5 A medição

`scripts/perf/medir-guarda.mjs` — novo, só leitura, zero dependência nova (`fetch` do Node e
`@supabase/supabase-js`, que já é dependência), herdando de `medir.mjs` as quatro regras do
cabeçalho e o método (aquecimento descartado → 15 rodadas em round-robin → mediana e p95 por
interpolação), e reusando a mesma cascata de credencial (`PERF_*`/`SMOKE_*`).

---

## 4. As três decisões obrigatórias

### Decisão 1 — a trava reconhece a indireta de UM nível (opção **a**)

**O custo que decidiu foi medido no código, não estimado.** O padrão do helper local não é
exceção de um arquivo: é a convenção de **dois**. Além de `barrado()` em `exportar.ts`,
`compras.ts` concentra as três sugestões em `sugerir()`, que já carrega o piso de caracteres, o
`try/catch` e o log. A opção (b) — inlinear a guarda — obrigaria a duplicar `createClient()` +
`exigirPapel` **sete** vezes e a espalhar por sete lugares o comentário de doze linhas da F21.
Pioraria o código para agradar a um teste.

O preço de (a) é a trava ficar mais esperta, e ele foi pago com sabotagem própria (**C**):
cadeia de **dois** níveis reprova, e helper **homônimo** — uma função chamada `barrado` que não
guarda nada — também reprova, porque o que a trava reconhece é a **declaração local**, nunca o
nome.

**Consequência boa e não prevista:** a guarda das três de compra pôde nascer dentro do
`sugerir()`, num lugar só e **depois** do piso de caracteres — o que evita uma ida ao Supabase
por tecla antes da segunda letra. Com (b), a guarda viria antes ou seria repetida três vezes.

### Decisão 2 — `prefixo-busca.ts` sai de `queries/` (opção **a**)

Era o **único** módulo da pasta que não toca o banco: uma constante e uma regex. Seria a única
exceção da catraca, logo na estreia dela. Movido com `git mv` para `src/lib/busca/prefixo.ts`;
três imports reescritos (`queries/colaboradores.ts:6`, `queries/movimentacoes.ts:20` e o
próprio teste, que continua importando o valor direto e **sem** `vi.mock`).

A alternativa custaria zero hoje e duas coisas depois: proibiria sem razão que um Client
Component validasse o prefixo antes de chamar o servidor, e faria a catraca nascer com uma
exceção. Uma catraca que estreia com exceção estreia afrouxada. Hoje `DISPENSADOS` é `{}`.

### Decisão 3 — o custo doeu? **Não.**

A régua combinada era: a guarda **fica**, o número vira manchete, e mitigação (se houver) vira
proposta escrita — nunca remover a guarda de um caminho quente, nunca trocá-la por
`idOperador()`. O número não obrigou a nada disso.

---

## 5. A MEDIÇÃO — método, ambiente e veredito

**Por que um instrumento novo.** `scripts/perf/medir.mjs` é **só GET** por regra escrita no
cabeçalho dele (linha 16), e Server Action **não é rota GET**: o cliente a alcança por POST com
o header `Next-Action: <id>`, e esse id é gerado pelo compilador e muda a cada build. Medir a
action de fora exigiria extrair o id do bundle a cada deploy — frágil — e mediria a soma
(rede + framework + guarda + query), com a parcela da guarda dentro da margem de erro.

**O que foi medido.** A guarda é, exatamente, duas idas à rede na primeira chamada de um
request, na ordem em que `cargoDoRequest` as faz: `auth.getUser()` (o que `idOperador()` faz —
não é decode local, é uma chamada a `/auth/v1/user`) e `rpc('papel_atual')` (o que `lerPapel()`
faz). O **par** foi medido de verdade, em sequência — não somando as medianas isoladas, porque
a soma de medianas não é a mediana da soma e o reuso de conexão entre a 1ª e a 2ª é parte do
que se quer capturar.

**Ambiente:** Supabase de produção, sessão de operador real por login com senha, medido **da
mesa** (Windows, conexão doméstica). Método idêntico nas duas rodadas: 2 passadas de
aquecimento descartadas, 15 rodadas em round-robin, mediana e p95 por interpolação linear.

| medida | antes (mediana / p95) | depois (mediana / p95) |
|---|---|---|
| `auth.getUser()` | 36,7 / 45,0 ms | 38,5 / 55,9 ms |
| `rpc('papel_atual')` | 34,1 / 48,7 ms | 33,7 / 53,8 ms |
| **o PAR — o custo da guarda** | **71,8 / 94,8 ms** | **72,7 / 90,5 ms** |

**Delta antes→depois: 0,9 ms.** É ruído, e era o esperado: o instrumento mede as duas chamadas
ao Supabase, que são as mesmas antes e depois — o que a fase mudou foi *quantas* actions as
fazem, não *quanto* elas custam. Rodar duas vezes prova que a medição é reprodutível e que o
número não foi colhido num instante bom.

**Veredito: ~72 ms de mediana, ~91 ms de p95 por chamada, e não dói** — por três razões
medidas, não opinadas:

1. **O debounce já limita.** 300 ms de espera antes de consultar significa no máximo uma
   chamada por pausa de digitação, e a busca que a guarda protege custa outra ida ao banco de
   qualquer forma.
2. **O número é um teto pessimista.** Foi medido da mesa; a lambda da Vercel fala com o
   Supabase na **mesma região** (GRU1, desde a F33), por um caminho de rede muito mais curto.
3. **A segunda guarda do mesmo request custa zero.** `cargoDoRequest` é `cache()` por
   requisição desde a F21 (`acesso.ts:260`) — a mitigação que a ficha propunha já estava no ar
   há dois meses.

**Nada foi proposto para a F60, e é conclusão, não omissão.** Com o `cache()` já valendo, não
sobrou mitigação de custo sem contrapartida. A única concebível — memoizar o **vínculo** — está
proibida por escrito no comentário de `cargoDoRequest`, porque mataria a revogação no request
seguinte (ADR-002 §4).

Saída bruta em `docs/perf/f49-guarda-antes.json`, `-depois.json` e o consolidado
`docs/perf/f49-guarda.json`. Nenhum dado real, id de produção ou segredo nos três: o script
mascara e-mail, senha e chave em qualquer saída (stack trace inclusive), e grava o cargo apenas
como `papel_presente: true`.

---

## 6. As sabotagens — e a saída vermelha antes das correções

Todas em `docs/f49-evidencias/`, com a saída real.

### A saída VERMELHA da trava, antes das nove correções
`00-trava-vermelha-antes-das-nove.txt` — **11 casos vermelhos, 5 verdes**, com as nove nomeadas
uma a uma:

```
× nenhum export ficou sem guarda e sem motivo escrito
× src/lib/actions/movimentacoes.ts::buscarAtivosParaMovimentacao está guardada, e não isenta
× src/lib/actions/movimentacoes.ts::resolverPatrimoniosParaLote está guardada, e não isenta
× src/lib/actions/movimentacoes.ts::buscarColaboradoresDoCampo está guardada, e não isenta
× src/lib/actions/movimentacoes.ts::buscarSugestoesSetores está guardada, e não isenta
× src/lib/actions/movimentacoes.ts::buscarPossiveisDuplicatasDoDia está guardada, e não isenta
× src/lib/actions/movimentacoes.ts::buscarResumoDeAtivosPorIds está guardada, e não isenta
× src/lib/actions/compras.ts::buscarSugestoesMarca está guardada, e não isenta
× src/lib/actions/compras.ts::buscarSugestoesModelo está guardada, e não isenta
× src/lib/actions/compras.ts::buscarSugestoesFornecedor está guardada, e não isenta
Tests  11 failed | 5 passed (16)
```

A trava ficou verde porque as nove foram **corrigidas**, não porque ela foi afrouxada.

### As seis sabotagens

| # | O que foi quebrado | O que a trava fez |
|---|---|---|
| **A1** | removida a guarda de `buscarSugestoesSetores` | acusou por **dois** casos: o agregado e o nominal (`perdeu a guarda`) |
| **A2** | tentativa de **isentar** essa função em vez de guardá-la | recusou por **dois** caminhos: a lista nominal (`não pode estar em SEM_GUARDA — ela TEM guarda`) e o teto (`expected 7 to be less than or equal to 6`) |
| **B** | `export async function` novo, sem guarda, em `tipos-item.ts` | acusou nomeando função e linha |
| **C** | indireta de **dois** níveis **e** helper homônimo `barrado()` sem guarda | acusou **as duas**, no mesmo run |
| **D** | `import 'server-only'` removido de `queries/ativos.ts` | acusou nomeando o arquivo |
| **E1** | `import type` trocado por import **misto** `{ buscarAtivosParaCombobox, type AtivoResumo }` em módulo `'use client'` | acusou — é o caso que uma trava ingênua confundiria com `import type` |
| **E2** | a mesma sabotagem, contra o `npm run build` | **ver §7** |
| **F** | `createAdminClient()` num arquivo não declarado (`actions/kits.ts`) | acusou nomeando o arquivo |

---

## 7. ACHADO — o `npm run build` **não** pega import de valor não usado

A suposição de trabalho era que a metade (2) de `servidor-apenas.test.ts` fosse redundante com
o build, que quebra por causa do `server-only`. A sabotagem foi rodada **duas vezes**:

- com o binding **importado e não usado** → `npm run build` **passa limpo, exit 0**. O
  compilador elide o import antes de o grafo do cliente alcançar `server-only`.
- com o binding **usado** (uma linha `const _s = buscarAtivosParaCombobox`) → o build quebra, e
  o Turbopack imprime a cadeia inteira:

```
Error: Turbopack build failed with 3 errors:
  #3 [Client Component Browser]:
    ./src/lib/supabase/server.ts [Client Component Browser]
    ./src/lib/queries/ativos.ts [Client Component Browser]
    ./src/components/movimentacoes/ativo-combobox.tsx [Client Component Browser]
You're importing a module that depends on "server-only".
```

**Consequência:** a trava é estritamente mais forte que o build neste caso. O import morto entra
no repositório sem nada reclamar e fica esperando a primeira linha que o use — que é exatamente
como uma fronteira volta a ser atravessada meses depois, num commit que "só usa o que já estava
importado". O cabeçalho do teste e a mensagem de falha foram **corrigidos**: a redação inicial
afirmava que o build pegava o caso, e estava errada.

---

## 8. Os 19 critérios, autoverificados

| # | Critério | Estado | Evidência |
|---|---|---|---|
| 1 | as nove com `exigirPapel('consulta')`, degradação idêntica | ✅ | §3.1; `git diff main -- src/lib/actions/` |
| 2 | teto por `MAX_LOTE_COMPRA` (200) com log no padrão dos vizinhos | ✅ | `movimentacoes.ts`, `buscarResumoDeAtivosPorIds` |
| 3 | `guardas-de-action.test.ts` reprova ao remover qualquer das nove | ✅ | sabotagem **A1** + a saída vermelha inicial, que nomeia as **nove** |
| 4 | `SEM_GUARDA` nominal, com motivo; nenhuma das nove lá; só encolhe | ✅ **6 entradas**, não 5 | sabotagem **A2**; §2 |
| 5 | Decisão 1 tomada, registrada e aplicada; sabotagem de 2 níveis | ✅ | ata em `DECISOES.md`; sabotagem **C** |
| 6 | todo módulo de `lib/queries` com `server-only`; os 7 de `relatorios/` nomeados | ✅ **27/27** | §3.2 |
| 7 | `servidor-apenas.test.ts` com as duas metades; tipo × valor; cabeçalho honesto | ✅ | §3.3, §7 |
| 8 | Decisão 2 aplicada; `prefixo-busca` num lugar só; teste passa sem exceção nova | ✅ | §4; `DISPENSADOS = {}` |
| 9 | testes que importam valor ganharam `vi.mock` com comentário | ✅ **15 arquivos**, não 4 | §9 |
| 10 | `superficie-admin.test.ts` enumera os call-sites, com guarda nomeada | ✅ | sabotagem **F** |
| 11 | `queries/admin.ts` com o cabeçalho do segundo módulo sem RLS | ✅ | §3.4 |
| 12 | `paleta-comandos.tsx` só com o cabeçalho; `filial_nome` intacto | ✅ | 33+/0−; `filial_nome` na 556 |
| 13 | `medir-guarda.mjs` só-leitura, sem dependência nova; JSON com antes e depois | ✅ | §5 |
| 14 | o custo em milissegundos, com método, e o veredito | ✅ | §5 |
| 15 | lint, test, build e tsc limpos; zero arquivos em `supabase/` | ✅ | §10 |
| 16 | `db:test` e `db:test:mutations` sem nada de novo | ✅ | nada em `supabase/` mudou; ver §11 |
| 17 | emenda na matriz a partir de R-ACC-36, contador atualizado | ✅ | 239 → **243** |
| 18 | v1.54.0 no `package.json` e no registry; tag anotada; CHANGELOG | ✅ | §10 |
| 19 | PR mergeado com os dois checks verdes; `main` em repouso | — | §11 |

---

## 9. O que divergiu da ordem, e por quê

1. **A trava varre o `src/` inteiro, não só `src/lib/actions/`.** Existe um módulo
   `'use server'` fora da pasta — `src/app/(app)/dev/acoes-export.ts` — e ele **já estava
   guardado** (`exigirDev`). A rede larga custou zero verde e fechou o caminho de escrever a
   próxima action dentro de `src/app/**`, onde uma trava restrita à pasta não olharia.
2. **`SEM_GUARDA` tem 6 entradas, não 5.** `senhas.ts::sairVisualizacao` — o logout do
   visualizador — não tem guarda e legitimamente não deve ter: apaga o próprio cookie e
   redireciona; exigir cargo prenderia na visualização quem não tem cargo. É o gêmeo de
   `auth.ts::signOut`, que a ficha já isentava.
3. **15 testes ganharam `vi.mock('server-only')`, não 4.** Os `ajuda/` importam
   `MOV_PAGE_SIZE` e `GERADOS_PAGE_SIZE` como **valores** de `queries/movimentacoes.ts` e
   `queries/gerados.ts` — imports legítimos de servidor para servidor, que só quebram no
   ambiente `node` do Vitest. Receita idêntica à de `scrypt-senha.test.ts`, com comentário.
4. **Seis call-sites de debounce, não sete** — e um deles não segue o padrão: 400 ms e sem piso
   de 2 caracteres. A action que ele chama (`buscarSaldoPorNomeDeColaborador`) **já tinha**
   guarda, então não entrou no escopo.
5. **A medição precisou de instrumento novo** — previsto pela ordem, e a razão está em §5.

---

## 10. Verificação executada

```
npm run lint      → limpo (0 problemas)
npx tsc --noEmit  → limpo
npx vitest run    → Test Files 162 passed (162) · Tests 4099 passed (4099)
npm run build     → exit 0, 0 erros   (docs/f49-evidencias/build-limpo.txt)
git diff main --stat -- supabase/  → VAZIO
```

O `npm run build` é a quarta trava, de graça: é ele que prova a fronteira RSC de ponta a ponta
com o grafo real do bundler. Rodou limpo com os 27 módulos declarando `server-only`.

Diff total da fase: **67 arquivos, +3177 / −22**. As 22 remoções são os 22 topos de arquivo
onde a linha `import 'server-only'` foi inserida (o `sed` conta a linha reescrita), o move de
`prefixo-busca` e a linha de `limpar` que passou de local a exportada.

---

## 11. O que este relatório NÃO prova

1. **Guarda de action é a SEGUNDA linha, não a primeira.** A primeira continua sendo a RLS, e
   as nove leituras tocam tabelas cujas policies de SELECT seguem `papel_atual() is not null`
   **por desenho** (ADR-001, mantida pela ADR-002). Um verde em `guardas-de-action.test.ts` não
   diz nada sobre o Postgres.
2. **A trava prova que a guarda é CHAMADA — não que ela é alcançada em todo caminho**, nem que
   o `if (!aut.ok)` seguinte faz a coisa certa. Guarda dentro de um ramo morto passaria. Isso é
   revisão humana, e está escrito no cabeçalho de `guardas-de-action.ts` para não ser confundido
   com garantia.
3. **`server-only` protege o BUNDLE, não a rede.** Ele impede a query de ir para o navegador; não
   diz nada sobre quem chama a Server Action que a usa. As duas fronteiras são independentes, e
   é por isso que são duas travas.
4. **Nada aqui é recorte por filial ou por empresa.** Guarda responde "pode ler?", nunca "pode
   ler O QUÊ". O recorte é a F57.
5. **O número da medição é da mesa, não da produção.** É um teto pessimista, e o relatório diz
   isso em vez de apresentá-lo como o custo real do usuário.
6. **`npm run db:test` e `npm run db:test:mutations` não foram executados nesta mesa** — ela não
   tem Postgres nem Docker (registrado desde a F46). Esta fase **não tocou o banco**, então não
   havia o que eles pudessem detectar de diferente; eles rodam no `banco-sem-docker`, que é
   *required check* do PR.

---

## 12. Pendências e backlog

### 12.1 A `0128` continua sem aplicar em produção — terceira fase seguida

`supabase/migrations/0128_adota_bkp_relatorios_f6a.sql` segue pendente. A ordem mandava tentar
**se** o MCP do Supabase estivesse conectado. Ele **não está** nesta sessão. Conforme instruído:
não insisti, não inventei caminho alternativo, não mexi em credencial.

**O que falta:** uma sessão com o MCP do Supabase conectado (ou o Studio aberto pelo Johnny),
aplicando pelo caminho A do `RUNBOOK-BANCO.md` e rodando as três consultas do bloco
*VERIFICAÇÃO PÓS-APPLY* — a terceira tem de devolver **2**.

### 12.2 Backlog nomeado para a F50

- **A revogação do `EXECUTE` de `anon` das cinco funções INVOKER** (`chave_identidade_ativo`,
  `hoje_brt`, `mov_da_carga_import`, `status_apos_movimentacao`, `valida_lancamento_item`), na
  migration **`0129`**. Herdada da F48 §12.2 e **explicitamente carregada para a F50** por
  decisão do Johnny de 08/09/2026 — não era desta fase.
- **`podeLer` em `src/components/layout/permissoes.ts`**, alcançando também
  `paleta-comandos.tsx`. O ponto exato de entrada está marcado no cabeçalho novo da paleta.
- **`queries/relatorios/comum.ts`** — o `const { data } = await` que engole o erro.
- **Reescrever `fronteira-viewer.test.ts`**, que a própria ficha da F50 já registra como
  desatualizado.

### 12.3 Backlog herdado, ainda aberto (entrega avulsa, PATCH)

- comentário morto em `scripts/gen-types.ts` (cita o job `banco`, removido na v1.51.1);
- exclusão `_%` em `supabase/ci/impressao-schema.sql`.

### 12.4 Achado desta fase, para quem cuidar do caminho quente

O sexto call-site de debounce (`com-esta-pessoa-devolucao.tsx:46`) usa **400 ms** e não tem piso
de 2 caracteres — diferente dos outros cinco (300 ms / mín. 2). A action que ele chama já tem
guarda, então não há furo; é inconsistência de UX, não de segurança. Fica registrado porque foi
medido.
