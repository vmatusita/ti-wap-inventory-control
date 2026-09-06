# Relatório da F45 — O portão fecha, e o teste de componente ganha piso

Executada em **05/09/2026**, modo autônomo, branch `f45-portao`, versão **1.50.0**.

**Por que esta fase existe, em duas frases.** O `docs/PLANO-MULTIEMPRESA.md` deixa cerca de trinta
travas anti-reincidência espalhadas pelas 27 fases seguintes, e todas valiam zero, porque o CI podia
marcar ✗ e a Vercel publicava igual — uma trava que informa não é trava, é documentação do vazamento
depois que ele foi ao ar. Junto do portão vieram as três coisas que só fazem sentido no mesmo
commit: a honestidade dos roteiros SQL, o runner único, e o piso de teste de componente.

> ## ⚠ ESTE RELATÓRIO FOI CORRIGIDO — leia isto antes do resto
>
> A primeira versão dele, escrita em 05/09/2026, deixava **duas pendências** e atribuía as duas à
> falta de insumo da máquina. **Uma das duas causas era FALSA.**
>
> **O `gh` (GitHub CLI) ESTAVA instalado, e autenticado.** Só não estava no `PATH` desta sessão —
> ele mora em `C:\Program Files\GitHub CLI\gh.exe`, e um `gh --version` no bash devolvia
> `command not found`. Tomei esse `command not found` como prova de ausência e não conferi de
> segunda forma. Por causa disso a fase declarou como "insumo físico que só o Johnny tem" algo que
> estava ao alcance da mão o tempo todo. **O erro é meu, e a §15 conta como ele aconteceu.**
>
> Com o `gh`, no mesmo dia, as duas pendências fecharam:
>
> 1. **O portão está LIGADO e PROVADO.** `verificar` e `banco` são *required status checks* na
>    `main`, com *require pull request* e bypass do Johnny — e um PR descartável com um roteiro
>    deliberadamente vermelho teve o merge **BLOQUEADO** (§8 e `prova-7-portao-fecha.txt`).
> 2. **O SQL foi executado.** O job `banco` do commit de merge rodou os 25 roteiros contra um
>    Postgres real: **577 asserções, 0 falhas** (§9 e `prova-6-ci-banco.txt`).
>
> E ler o CI revelou um defeito que nenhuma leitura de código tinha achado: a correção do
> `cancel-in-progress` estava **pela metade** (§16). Foi corrigida na `v1.50.1`.
>
> O que continua verdade sem ressalva: **não há Docker nem Postgres nesta máquina** (veto do Johnny,
> F30), então o SQL segue sem poder ser executado *localmente* — quem o executa é o CI.

---

## 1. Os oito pontos do diagnóstico, conferidos um a um

A ordem mandava conferir antes de aceitar. Sete bateram; **um não bateu.**

| # | Afirmação da ordem | Veredito | Prova |
|---|---|---|---|
| 1 | O CI não reprova nada — nenhum *required status check*, `main` sem proteção | ✅ **confere** | dois jobs no `ci.yml`, nenhum obrigatório; a Vercel publica por push |
| 2 | `cancel-in-progress: true` vale para push e para PR | ✅ **confere** | `ci.yml:13` na `v1.49.1` |
| 3 | `verificar-actions-build.mjs` existe, é bom, e ninguém roda | ✅ **confere** | ausente do `package.json` e do `ci.yml` desde a F13 (23/07/2026) |
| 4 | O loop dos roteiros vive dentro do YAML | ✅ **confere** | `for f in supabase/tests/*.sql` no passo "Rodar os roteiros de teste SQL" |
| 5 | Roteiro que aborta cedo passa verde; nenhum tem linha `FIM` | ✅ **confere** | `grep -l FIM supabase/tests/*.sql` → **nenhum** dos 24 |
| 6 | **13** roteiros não contam asserção nenhuma | ❌ **NÃO CONFERE — são 15** | ver abaixo |
| 7 | Zero `.test.tsx` em 273 `.tsx`; `react-dom` 19.2.8; `"jsx": "react-jsx"` | ✅ **confere** | `find` → 0 e 273; `tsconfig.json:14` |
| 8 | O `include` do Vitest deixa buracos | ✅ **confere**, com ressalva | ver abaixo |

### 1.1 O achado nº 1 — eram QUINZE, não treze

A lista de treze da ordem está correta no que afirma e **incompleta no que omite**.
`dominios_login.sql` e `itens_quantidade.sql` também não contavam asserção nenhuma. Os dois têm uma
variável chamada `v_ok` — e é isso que os escondeu de um `grep` — mas ela é **booleana**, não
contador:

```sql
-- dominios_login.sql:28 (antes)      -- itens_quantidade.sql:47 (antes)
  v_ok     boolean;                     v_ok      boolean;
      v_ok := true;                       v_ok := false;
    exception when others then            exception when others then v_ok := true;
      v_ok := false;                    if v_ok then raise notice '✓ 6: …';
```

Contagem correta, por `grep -cE 'v_ok := v_ok \+ 1'`:

```
asof_desempate           0      f41_regularizacao       26      pendencias_item          0
cargo_dev               48      fuso_do_negocio          0      reabrir_pendencia_item   4
conflito_filiais        37      import_substituir        0      seguranca_catalogo       0
dev_destrutivo          82      itens_extra              0      transferencia_item      18
dominios_login           0  ←   itens_quantidade         0  ←   transicoes_extra         0
f34_triagem_reserva      0      manutencao_fornecedor    0      troca                    0
f36_detentor             0      maquina_estados          0
f37_colaboradores_tipos 26      papeis_rls              80
pendencias_import_termo  0
```

**Nove** roteiros contavam; **quinze** não. As duas variáveis foram renomeadas — `v_aceitou` e
`v_recusou`, mesma semântica — antes de o contador entrar, senão haveria colisão de nome e tipo no
mesmo `declare`, que o PL/pgSQL recusa.

### 1.2 A ressalva do ponto 8

O buraco do `include` é real, mas hoje é **latente**: os 149 arquivos de teste existentes estão
todos cobertos por `src/**/*.test.ts` ou `scripts/import/__tests__/**/*.test.ts`. O que o recorte
estreito garante é que o **próximo** teste escrito em `scripts/env-guard.ts`, `scripts/design/` ou
`scripts/termos/` nasça morto. Já a metade `.test.tsx` do buraco foi confirmada ao vivo:

```
$ npx vitest run src/lib/descartavel-jsx.test.tsx
No test files found, exiting with code 1
include: src/**/*.test.ts, scripts/import/__tests__/**/*.test.ts
```

Por isso a trava afirma **cobertura por padrão**, e não "não há órfão hoje".

---

## 2. O runner — o loop sai do YAML, e passa a poder reprovar

`scripts/db/rodar-roteiros.sh` é chamado pelos dois lados: pelo job `banco` do CI e por
`npm run db:test` na mesa. Ele reprova por cinco motivos, e três deles são novos:

| # | Motivo | Novo na F45? |
|---|---|---|
| 1 | `psql` saiu diferente de 0 | não |
| 2 | a linha `FIM <nome>` não apareceu | **sim** — abortar em silêncio era o buraco maior |
| 3 | a linha `FIM` declara `0` asserções | **sim** |
| 4 | a linha `FIM` declara mais de `0` falhas | **sim** (redundante com o 5, de propósito) |
| 5 | saiu `WARNING:  ✗` **ou** `NOTICE:  ✗` | o `NOTICE` é novo |

### 2.1 A prova da lógica de reprovação, sem banco

Não há Postgres nesta máquina, então a lógica foi provada com um **`psql` dublê** no `PATH`, que
devolve saída encomendada por cenário. O runner rodou de verdade em cada caso
(`docs/f45-evidencias/prova-2-runner.txt`):

```
  OK   roteiro sadio passa                    saida=0
  OK   abortou cedo (sem linha FIM) REPROVA   saida=1
  OK   ✗ em WARNING REPROVA                   saida=1
  OK   ✗ em NOTICE REPROVA (novo na F45)      saida=1
  OK   ✗ citado em texto NÃO reprova          saida=0
  OK   zero asserção REPROVA                  saida=1
  OK   erro de psql REPROVA                   saida=1

### O loop pula os arquivos _*.sql
  roteiros em supabase/tests/ (sem _*): 25
  roteiros que o runner mandou ao psql: 25
  vezes em que _asserts.sql foi tratado COMO roteiro: 0 (tem de ser 0)

### _asserts.sql é carregado ANTES do roteiro, na MESMA sessão
  OK   psql postgresql://…:54322/postgres -v ON_ERROR_STOP=1 -f supabase/tests/_asserts.sql -f supabase/tests/troca.sql
```

A última linha é a que importa mais do que parece: **dois `-f` numa chamada só = uma sessão só**, e
é isso que faz `pg_temp` sobreviver ao `rollback` de cada roteiro.

### 2.2 O caso "✗ informativo"

Catorze roteiros terminavam com `raise notice '=== fim do roteiro X (procure por ✗ acima) ==='`.
Contar `NOTICE:.*✗` como falha, sem mais, transformaria os catorze em vermelho. Duas defesas, e as
duas estão no lugar: o `✗` tem de **abrir** a mensagem (regex `(WARNING|NOTICE):[[:space:]]+✗`), e
esses rodapés **saíram** — a linha `FIM` diz o mesmo, com número, e "procure por ✗" deixou de ser o
protocolo.

---

## 3. Os 25 roteiros — a tabela, e a prova de que nenhum cenário mudou

### 3.1 Antes × depois, roteiro a roteiro

| Roteiro | Contava antes? | O que ganhou | Linhas alteradas |
|---|---|---|---|
| `asof_desempate` | não | contador + FIM | 8 |
| `cargo_dev` | **sim** (48) | só FIM | 0 |
| `conflito_filiais` | **sim** (37) | só FIM | 0 |
| `dev_destrutivo` | **sim** (82) | só FIM | 0 |
| `dominios_login` | **não** ← achado nº 1 | renome `v_ok`→`v_aceitou` + contador + FIM | 14 |
| `f34_triagem_reserva` | não | contador + FIM | 47 |
| `f36_detentor` | não | contador + FIM | 36 |
| `f37_colaboradores_tipos` | **sim** (26) | só FIM | 0 |
| `f38_itens_com_ativo` | **sim** (48) | só FIM | 0 |
| `f41_regularizacao` | **sim** (26) | só FIM | 0 |
| `fuso_do_negocio` | não | contador + FIM | 10 |
| `import_substituir` | não | contador + FIM | 24 |
| `itens_extra` | não | contador + FIM | 10 |
| `itens_quantidade` | **não** ← achado nº 1 | renome `v_ok`→`v_recusou` + contador + FIM | 38 |
| `manutencao_fornecedor` | não | contador + FIM | 44 |
| `maquina_estados` | não | contador + FIM | 31 |
| `papeis_rls` | **sim** (80) | só FIM | 0 |
| `pendencias_import_termo` | não | contador + FIM | 10 |
| `pendencias_item` | não | contador + FIM | 26 |
| `reabrir_pendencia_item` | **sim** (4) | só FIM | 0 |
| `seguranca_catalogo` | não | contador + FIM | 13 |
| `transferencia_item` | **sim** (18) | só FIM | 0 |
| `transicoes_extra` | não | contador + FIM | 34 |
| `troca` | não | contador + FIM | 27 |
| **`asserts_ferramenta`** | — | **roteiro NOVO** (o autoteste da ferramenta) | — |

### 3.2 A prova de que nenhum cenário mudou — mecânica, não afirmada

A instrumentação foi feita por **transformação determinística**, e o diff foi conferido linha a linha
contra a regra ("toda linha alterada tem de voltar EXATAMENTE ao original quando se removem só os
prefixos de contador e os dois renomes"). Saída real em
`docs/f45-evidencias/prova-4-instrumentacao.txt`:

```
pares que voltam EXATAMENTE ao original ................ 371
pares que voltam a menos de ESPAÇO (só realinhamento) .. 1
linhas puramente acrescentadas (declare + FIM) ......... 54  (15 × 2 declare + 24 FIM = 54)
linhas puramente removidas (o rodapé antigo) ........... 14  (os 14 roteiros que tinham rodapé)
DIVERGÊNCIAS .......................................... 0

NENHUM CENÁRIO MUDOU.
```

O único par "a menos de espaço" é a coluna do `declare` de `dominios_login.sql`, que o renome
desalinhou (`v_ok     boolean;` → `v_aceitou boolean;`).

**Nenhuma condição, nenhum valor esperado, nenhuma mensagem de asserção e nenhum patrimônio
fictício mudou.** Isso é verificável a qualquer momento: `node prova-instrumentacao.mjs` recalcula.

### 3.3 O que "N asserções" significa, com precisão

`N` conta as asserções que **se pronunciaram** — que emitiram `✓` ou `✗`. Três guardas de
pré-condição do acervo (`itens_quantidade` 11a, `transicoes_extra` 1c e o setup do cenário 10 de
`f41_regularizacao`) têm só ramo de falha: `if <ruim> then v_falhas := v_falhas + 1; warning; end if;`.
Quando passam, não somam. **É deliberado** — elas são guarda, não asserção, e contá-las sem imprimir
`✓` faria o número divergir das linhas visíveis no log. Nenhuma delas mascara falha: quando falham,
contam e imprimem `✗`.

### 3.4 Sete roteiros têm saída antecipada — e agora isso é visível

`cargo_dev:129`, `dev_destrutivo:192`, `f38_itens_com_ativo:129`, `f41_regularizacao:114`,
`papeis_rls:190`, `transferencia_item:90` e `reabrir_pendencia_item` têm um `return;` de
pré-condição ("o banco precisa de ao menos DUAS filiais ativas"). Se ele disparar, o roteiro sai sem
emitir a linha `FIM` e **o runner passa a reprovar** — o que antes seria um verde silencioso. No CI
real isso não deve acender: o job aplica todas as migrations, e as filiais da `0007`/`0026` existem.
**Se acender, é sinal verdadeiro**, não regressão da F45.

---

## 4. `pg_temp.assert_zero_de` — a asserção que recusa conjunto vazio

O repositório tem dezenas de asserções da forma `if v_n = 0 then ✓`. Todas passam sobre conjunto
vazio: se o cenário não montou o dado, `count(*)` devolve 0, o roteiro imprime ✓ e o CI fica verde.
Roteiro tautológico é pior que roteiro nenhum, porque dá sensação de rede.

```sql
pg_temp.assert_zero_de(rotulo text, ruins bigint, universo bigint) returns boolean
```

- `universo` vazio ou nulo → **`raise exception`** ("universo vazio … a asserção passaria sobre
  conjunto vazio (tautologia)");
- `ruins` nulo, negativo, ou maior que `universo` → **`raise exception`** (erro de quem chamou);
- `ruins = 0` → `✓ <rótulo> (0 de N conferidos)`, devolve `true`;
- `ruins > 0` → `✗ <rótulo>: R de N fora da regra`, devolve `false`.

**Por que exceção, e não `✗`.** Universo vazio não é "o cenário falhou": é "o cenário não existiu".
A exceção derruba o bloco, o roteiro não emite `FIM`, e o runner reprova pela ausência da linha —
**as duas peças foram desenhadas para se encaixarem, e é por isso que nasceram no mesmo commit.**

**A prova da recusa foi EXECUTADA** — no job `banco` do CI, contra um Postgres real:

```
NOTICE:  ✓ 1 universo vazio RECUSADO: assert_zero_de: universo vazio em "autoteste 1" —
         a asserção passaria sobre conjunto vazio (tautologia). Monte o cenário ou conte outra coisa.
NOTICE:  ✓ 1b universo NULL RECUSADO
NOTICE:  ✓ autoteste 2 (este ✓ é esperado) (0 de 7 conferidos)
NOTICE:  ✓ 2 zero ruins de 7 devolve true
NOTICE:  ✓ 3 duas linhas ruins de 7 devolve false
NOTICE:  ✓ 4 mais ruins que o universo RECUSADO
NOTICE:  ✓ 4b contagem de ruins NULA RECUSADA
NOTICE:  ✓ 5 `count(*) = 0` sobre conjunto vazio é VERDADE — a forma antiga passaria aqui
NOTICE:  FIM asserts_ferramenta: 7 asserções, 0 falhas
```

Repare no que **não** aparece: nenhum `✗`. O caminho de falha do cenário 3 foi exercitado de fato
("duas linhas ruins de 7 devolve false") com o `WARNING` silenciado por `client_min_messages` —
o roteiro prova o `✗` sem que o `✗` reprove o roteiro, exatamente como desenhado.

`supabase/tests/asserts_ferramenta.sql` tem sete asserções sobre a própria ferramenta — universo vazio, universo nulo, caminho feliz, caminho de
falha (com `client_min_messages = error` para o `✗` esperado não reprovar o roteiro), contagem
incoerente, contagem nula, e a comparação que justifica tudo (`count(*) = 0` sobre conjunto vazio
**é** verdade).

De quebra, esse roteiro é a sentinela do carregamento: se o `-f _asserts.sql` sumir do runner, ele
morre com "function does not exist" e **um só** roteiro falha, pelo motivo certo.

**A conversão dos roteiros de produto para `assert_zero_de` NÃO foi feita**, e é escopo, não
esquecimento: trocar `if v_n = 0 then ✓` por `assert_zero_de` muda a FORÇA da asserção, e a ordem
restringe os roteiros a mudança de instrumentação. É matéria da fase dos catálogos de segurança
(§3 do plano: "o repositório já tem 34 asserções do formato `if v_n = 0 then ✓`").

---

## 5. O piso de teste de componente — grau 1, zero dependência nova

### 5.1 Primeiro a prova de que o transform funciona

Antes de escrever um teste de verdade, um descartável, exatamente como a ordem mandou
(`docs/f45-evidencias/prova-1-transform-jsx.txt`):

```
Test Files  1 passed (1) / Tests  1 passed (1)
```

O esbuild do Vitest lê `"jsx": "react-jsx"` do `tsconfig.json` e transforma JSX **sozinho**. Não foi
preciso `esbuild.jsx` na config, nem `@vitejs/plugin-react`, nem nada.

### 5.2 O projeto `puro` não perdeu um arquivo sequer

Critério 9. O `include` de `puro` mudou de
`['src/**/*.test.ts', 'scripts/import/__tests__/**/*.test.ts']` para
`['src/**/*.test.ts', 'scripts/**/*.test.ts', 'scripts/**/*.test.mts']` — só cresce.

```
$ diff docs/f45-evidencias/vitest-arquivos-antes.txt <(vitest list, depois)
(sem diferença)

antes:  149 arquivos, 3556 testes
depois: 149 arquivos, 3556 testes  ← o projeto `puro`, isolado
```

O crescimento total (153 arquivos, 3631 testes) é exatamente `ci-passos.test.ts` + os três
`.test.tsx`.

### 5.3 As três sementes — 16 asserções, e o que cada uma protege

| Semente | O que afirma | Por que ela e não outra |
|---|---|---|
| `aviso.test.tsx` | `erro`→`role="alert"`, `atencao`→`role="status"`, `informacao`→sem papel; o padrão é `erro`; os três papéis são distintos | O mapa `PAPEL` é **invisível**: nenhum teste de função pura o alcança, o build não o vê, e a tela parece igual dos dois jeitos. Só quem usa leitor de tela percebe a regressão. A F40 criou este componente para corrigir uma assimetria de 8:1 entre `role="alert"` e `aria-live` |
| `confirmacao-digitada.test.tsx` | o `aria-describedby` aponta para um `id` **que existe no HTML**; sem dica não há describedby pendurado; o `for` do rótulo casa com o `id` do campo; o `id` de fora vence o gerado | `aria-describedby` num id inexistente é **pior que nenhum** — o leitor não lê nada e a marcação parece certa na revisão. O TypeScript aceita as duas strings; o lint não as compara. É a caixa das quatro telas destrutivas |
| `pagina.test.tsx` | o título vira exatamente UM `<h1>`; descrição/ações/`aoLado` não viram `<h1>`; o cabeçalho é `<header>`; título com marcação fica dentro do `<h1>` | A regra 1 de `consistencia.test.ts` proíbe que uma tela escreva o próprio `<h1>`. A régua funciona **porque este componente escreve um** — e ninguém olhava o HTML que sai daqui. Trocar o `<h1>` por um `<div>` deixaria o produto sem título de nível 1, com a régua verde |

Nenhuma delas usa clique, evento ou estado: `renderToStaticMarkup` produz HTML estático, e é sobre
ele que as três afirmam.

### 5.4 As cinco varreduras repo-wide, e a decisão que a ordem pediu

Ata completa em `docs/DECISOES.md` (2026-09-05 · F45). Em resumo: **opção (a)** — excluir
`*.test.tsx` nas varreduras — e os testes ficam **ao lado do componente**.

A opção (b) (esconder por caminho) foi medida e **não funciona**:

| Varredura | raiz que ela percorre | `src/lib/componentes/` escapa? | `src/components/__testes__/` escapa? |
|---|---|---|---|
| `consistencia.test.ts` | `src/app` + `src/components` | sim | **não** |
| `cores.test.ts` (`TETO_PALETA_CRUA`) | **`src/` inteiro** | **não** | **não** |
| `so-servidor.test.ts` | `src/app` + `src/components` | sim | **não** |
| `use-server-exports.test.ts` | **`src/` inteiro** | **não** | **não** |
| `ajuda/registry.test.ts` | `src/app` + `src/components` | sim | **não** |

Não existe diretório dentro de `src/` que escape das cinco, porque duas delas varrem `src/` inteiro
sem exclusão de subpasta. A (b) resolveria no máximo 3 de 5 e teria de ser **combinada** com a (a)
— o que anula a vantagem alegada. Já a (a) são **seis linhas em cinco arquivos**, com **precedente
vivo** desde a F32 em `src/components/relatorios/fronteira-rsc.test.ts:35`.

**O que se afrouxa, dito com todas as letras:** o corte é por sufixo de nome, não por "é realmente
um teste". Um componente de produção batizado por engano `algo.test.tsx` escaparia da régua de
layout e da catraca de cor em silêncio.

**A catraca não se moveu.** `TETO_PALETA_CRUA` = **473**, `ARQUIVOS_COM_PALETA` = **61** — os mesmos
de antes. Como hoje existem zero `.test.tsx` além dos três novos (que não usam cor crua da paleta),
a exclusão é **no-op** no número de hoje: ela só protege o futuro.

---

## 6. A trava, e a prova de que ela sabe ficar vermelha

`src/lib/ci-passos.test.ts` — **59 asserções** em seis grupos. Ela nasce verde (é varredura de
catálogo), então a regra 4 do §4 é atendida provando que ela reprova. Quatro sabotagens, uma de cada
vez, cada uma desfeita logo depois (`docs/f45-evidencias/prova-3-trava-fica-vermelha.txt`):

| Sabotagem | Resultado |
|---|---|
| remover o passo `verificar:actions` do `ci.yml` | **3 testes falham** — "roda `npm run verificar:actions`", "vem DEPOIS do build", "o YAML chama pelo menos seis scripts" |
| devolver `cancel-in-progress: true` | **2 testes falham** — "não é `true` incondicional", "está condicionado a pull_request" |
| devolver o loop `for f in supabase/tests/*.sql` para dentro do YAML | **3 testes falham** — inclusive "`db:test` e `db:test:um` chamam o MESMO runner que o CI chama" |
| voltar o `include` ao recorte de antes da F45 e criar `scripts/design/descartavel.test.ts` | **1 teste falha** — *"estes arquivos de teste NÃO rodam em projeto nenhum"* |

A última é a que a ordem nomeou, e é a mais importante: ela é a única defesa contra o buraco em que
um teste escrito em `scripts/design/` ou `scripts/termos/` nasce morto sem ninguém saber.

**A árvore voltou limpa nas quatro** (`git status --porcelain` vazio depois de cada uma).

### 6.1 O que a trava afirma, por grupo

1. o job `verificar` mantém `npm ci`, `lint`, `test`, `contraste`, `build` e `verificar:actions` — e
   o último vem **depois** do build;
2. **todo** `npm run X` citado no YAML tem um script `X` no `package.json` (é assim que este tipo de
   gate morre: alguém renomeia o script e o passo passa a chamar um nome que não existe);
3. `cancel-in-progress` não é `true` incondicional e está condicionado a `pull_request`;
4. o passo dos roteiros chama o script, o loop inline não voltou, o runner carrega `_asserts.sql`
   com os dois `-f`, pula `_*.sql`, exige a linha `FIM` e conta `✗` em `NOTICE`;
5. **cobertura**: todo `*.test.*` do repositório casa com algum `include` de algum projeto — com um
   casador de glob artesanal (sem `picomatch` nem `minimatch`, que só existem como dependência
   **transitiva**) que tem os próprios casos de teste como guarda;
6. os roteiros SQL seguem o molde da linha `FIM`, e ela é a **última instrução** do bloco.

---

## 7. As saídas reais dos comandos

Ver `docs/f45-evidencias/comandos.txt` para a saída completa. Resumo:

| Comando | Antes (v1.49.1) | Depois (v1.50.0) |
|---|---|---|
| `npm run lint` | exit 0 | **exit 0** |
| `npm run test` | exit 0 — 149 arquivos, 3556 testes | **exit 0 — 153 arquivos, 3631 testes** |
| `npm run contraste` | exit 0 | **exit 0** |
| `npx tsc --noEmit` | exit 0 | **exit 0** |
| `npm run build` | exit 0 | **exit 0** |
| `npm run verificar:actions` | exit 0 — 22 chunks, VERDE | **exit 0 — 22 chunks, VERDE** |

O crescimento de 3556 → 3631 são as 59 asserções de `ci-passos.test.ts` e as 16 das três sementes.

**E o `tsc --noEmit` pegou um defeito que nem o `lint` nem o `build` pegam** — a mesma classe que a revisão da F44 já tinha nomeado. A primeira versão da trava fazia `await import('../../vitest.config.mts')` para ler os `include` do objeto real; o Vitest resolve, mas o `tsc` recusa (`TS5097 — An import path can only end with a '.mts' extension when 'allowImportingTsExtensions' is enabled`), e nem `npm run lint` nem `npm run build` enxergam, porque o build só typecheca o grafo do app. A saída foi **ler a config como TEXTO**, como o teste já faz com o YAML — afrouxar o `tsconfig.json` inteiro para um teste ficar verde é exatamente a troca que esta fase existe para não fazer.

---

## 8. O portão — ligado, e provado

### 8.1 O portão está LIGADO — e por que a primeira versão deste relatório dizia que não

**O que eu conclui, e estava errado:**

```
$ gh --version
bash: gh: command not found
$ Get-Command gh
gh NAO encontrado no PATH do PowerShell
```

Duas checagens, as duas por `PATH`, as duas negativas — e eu tratei isso como "não está instalado".
**Estava.** O `gh` 2.100.0 mora em `C:\Program Files\GitHub CLI\gh.exe`, esse diretório não está no
`PATH` que estas sessões herdam, e a conta já estava autenticada:

```
$ winget install --id GitHub.cli -e
Found an existing package already installed. Trying to upgrade the installed package...
No available upgrade found.

$ "/c/Program Files/GitHub CLI/gh" auth status
github.com
  ✓ Logged in to github.com account vmatusita (keyring)
  - Token scopes: 'gist', 'read:org', 'repo', 'workflow'
```

Foi o próprio `winget install` — pedido pelo Johnny — que denunciou o engano. O escopo `repo` e a
permissão de admin no repositório eram tudo de que a proteção precisava. A **§15** conta como o erro
aconteceu e o que muda para não se repetir.

### 8.2 O comando que foi rodado

Repositório **pessoal**, então o bypass do dono é `enforce_admins: false` —
`bypass_pull_request_allowances` só existe em repositório de organização:

```bash
gh api --method PUT -H "Accept: application/vnd.github+json" \
  repos/vmatusita/ti-wap-inventory-control/branches/main/protection \
  --input - <<'JSON'
{
  "required_status_checks": { "strict": true, "contexts": ["verificar", "banco"] },
  "enforce_admins": false,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
JSON
```

E o estado final, **lido de volta pela API** — não é o que eu mandei, é o que o GitHub respondeu:

```json
{
  "checks_obrigatorios":              ["verificar", "banco"],
  "branch_atualizada_antes_do_merge": true,
  "pr_obrigatorio":                   true,
  "aprovacoes_exigidas":              0,
  "admins_sujeitos_as_regras":        false,
  "force_push":                       false,
  "apagar_a_branch":                  false
}
```

Os nomes `verificar` e `banco` foram conferidos contra o que o CI **realmente publica**
(`gh api …/commits/29f252b/check-runs`), e não adivinhados — havia um terceiro, `Dependabot`, que de
propósito **não** entrou na lista.

**As quatro escolhas, e o porquê de cada uma:**

- `contexts: ["verificar","banco"]` — são os **ids dos jobs**, e é isso que o GitHub usa como nome do
  check quando o job não tem `name:`. Os dois jobs do `ci.yml` não têm.
- `strict: true` — a branch tem de estar atualizada com a `main` antes do merge. Custa uma rodada de
  CI a mais quando a `main` anda entre abrir e mergear o PR; num repositório de um desenvolvedor
  isso quase nunca acontece, e em troca evita o merge semanticamente quebrado. Se incomodar, `false`.
- `enforce_admins: false` — **este é o bypass do Johnny.** Com `true`, nem ele mergearia sem os
  checks, e a fase que travasse o CI travaria o dono junto.
- `required_approving_review_count: 0` — PR obrigatório, aprovação de terceiro não. Num repositório
  de um desenvolvedor, exigir aprovação seria exigir uma segunda pessoa que não existe.

### 8.3 Pelo painel, se um dia precisar mexer

*Settings → Branches → main* (ou *Rules → Rulesets*):

1. **Branch name pattern:** `main`
2. ✅ **Require a pull request before merging** · *Required approvals*: **0**
3. ✅ **Require status checks to pass before merging** · ✅ *Require branches to be up to date before
   merging* · marque **`verificar`** e **`banco`**
4. ❌ **Do not allow bypassing the above settings** — deixe **DESMARCADO**. É essa caixa que
   corresponde a `enforce_admins`; marcada, ela tranca o Johnny junto
5. ❌ *Allow force pushes* · ❌ *Allow deletions*

### 8.4 O que mudou, na prática, a partir de agora

- **Push direto na `main` continua possível para o Johnny** (é o bypass), mas o GitHub avisa:
  `remote: - 2 of 2 required status checks are expected.` Usar o bypass virou ato consciente.
- **Da F46 em diante, o caminho normal é PR** com espera do job `banco` (~3 a 6 min por rodada).
  Isso é o custo aceito na decisão 8 do plano.
- **Branch protection em repositório privado exige GitHub Pro** (ou Team/Enterprise). Funcionou
  aqui, então a conta tem o plano; se um dia a API devolver `403` com *"Upgrade to GitHub Pro"*,
  é isso.

### 8.5 A prova do portão — FEITA, e o resultado

O critério nº 1 ("um commit que quebre um roteiro SQL não chega em produção") foi provado de ponta a
ponta depois de ligar a proteção. Saída completa em `docs/f45-evidencias/prova-7-portao-fecha.txt`.

**O bypass funciona, e o GitHub avisa quando é usado:**

```
$ git push origin main            (com o portão já ligado)
remote: - 2 of 2 required status checks are expected.
   1135487..588195b  main -> main
```

**A quebra deliberada**, uma linha em `supabase/tests/troca.sql`:
`- if v_tipo = 'troca' then` → `+ if v_tipo = 'compra' then`.

**O job `banco` marcou ✗**, e as duas regras novas do runner acusaram de forma independente:

```
WARNING:  ✗ 1a esperado tipo `troca` na mov do substituto, obtido troca
NOTICE:   FIM troca: 13 asserções, 1 falhas

==== RESUMO ====
  ✗ troca — o contador declara 1 falha(s)
  ✗ troca — marcou 1 ✗ (cenário falhou)
  25 roteiro(s), 577 asserções no total
##[error]Process completed with exit code 1.
```

Checks do PR: `verificar` SUCCESS · **`banco` FAILURE**.

**E o merge ficou BLOQUEADO** — não só o estado declarado, mas a tentativa real:

```
$ gh pr view 21 --json mergeable,mergeStateStatus
{"estado_do_merge":"BLOCKED","estado_do_pr":"OPEN","mergeavel":"MERGEABLE"}

$ gh pr merge 21 --merge
X Pull request vmatusita/ti-wap-inventory-control#21 is not mergeable:
  the base branch policy prohibits the merge.
```

(`MERGEABLE` ali quer dizer "sem conflito de texto"; quem decide é o `mergeStateStatus`, e ele diz
`BLOCKED`.)

O PR foi **fechado sem mergear** e a branch apagada dos dois lados
(`estado: CLOSED · mergeado_em: null · commit_de_merge: null`); a `main` continua com
`if v_tipo = 'troca'` na linha 85. **A branch nunca tocou a `main`.**

A sequência, para reproduzir:

```bash
git checkout -b prova-do-portao
# uma linha deliberadamente vermelha num roteiro
git commit -am "prova descartavel"
git push -u origin prova-do-portao
gh pr create --fill --base main
gh pr view --json mergeable,mergeStateStatus     # espere BLOCKED
gh pr close --delete-branch                      # NUNCA mergeie
```

## 9. O SQL foi executado — o job `banco`, saída real

O que a primeira versão deste relatório listava como "não provado" está provado. O job `banco` do
commit de merge (`29f252b`, run `34005294521`) subiu um Postgres, aplicou as 126 migrations e rodou
os **25 roteiros instrumentados**. `verificar` ✅ 4m31s · **`banco` ✅ 3m19s**.

```
FIM asof_desempate: 4 asserções, 0 falhas          FIM manutencao_fornecedor: 19 asserções, 0 falhas
FIM asserts_ferramenta: 7 asserções, 0 falhas      FIM maquina_estados: 14 asserções, 0 falhas
FIM cargo_dev: 46 asserções, 0 falhas              FIM papeis_rls: 76 asserções, 0 falhas
FIM conflito_filiais: 38 asserções, 0 falhas       FIM pendencias_import_termo: 5 asserções, 0 falhas
FIM dev_destrutivo: 108 asserções, 0 falhas        FIM pendencias_item: 13 asserções, 0 falhas
FIM dominios_login: 16 asserções, 0 falhas         FIM reabrir_pendencia_item: 4 asserções, 0 falhas
FIM f34_triagem_reserva: 21 asserções, 0 falhas    FIM seguranca_catalogo: 8 asserções, 0 falhas
FIM f36_detentor: 18 asserções, 0 falhas           FIM transferencia_item: 18 asserções, 0 falhas
FIM f37_colaboradores_tipos: 26 asserções, 0 falhas  FIM transicoes_extra: 13 asserções, 0 falhas
FIM f38_itens_com_ativo: 51 asserções, 0 falhas    FIM troca: 13 asserções, 0 falhas
FIM f41_regularizacao: 25 asserções, 0 falhas
FIM fuso_do_negocio: 5 asserções, 0 falhas         ==== RESUMO ====
FIM import_substituir: 11 asserções, 0 falhas        25 roteiro(s), 577 asserções no total
FIM itens_extra: 4 asserções, 0 falhas
FIM itens_quantidade: 14 asserções, 0 falhas
```

Saída completa em `docs/f45-evidencias/prova-6-ci-banco.txt`. O que isso fecha:

- **Critério 6** — os 25 emitiram a linha `FIM`. Nenhum abortou no meio.
- **Critério 7** — **nenhum contou zero**. O menor é 4 (`asof_desempate` e `reabrir_pendencia_item`),
  o maior 108 (`dev_destrutivo`).
- **Critério 8** — `asserts_ferramenta` passou nas 7, e a recusa de universo vazio saiu literal (§4).
- **E a instrumentação não mudou cenário**: 577 asserções, **0 falhas**, na primeira execução. Se
  algum roteiro estivesse mentindo antes, a contagem o teria denunciado agora.

### 9.1 O que ainda NÃO é verificável desta máquina

Uma coisa só, e ela é real: **não há Docker nem Postgres aqui** (veto do Johnny, 09/08/2026, na F30),
o `.env.local` aponta para **produção** — onde a regra permanente 5 proíbe rodar roteiro de teste — e
o MCP do Supabase não está conectado a esta sessão. Então `npm run db:test` **não roda localmente
nesta máquina**; ele foi provado com um `psql` dublê (§2.1) e roda de verdade no CI.

Para o Johnny, que tem como levantar um Postgres, o comando é o mesmo do CI:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres npm run db:test
```

Isso não é mais uma pendência da fase — é uma característica do ambiente, e está registrada como tal.

---

## 10. O que mudou, por arquivo

| Arquivo | O que mudou | Por quê |
|---|---|---|
| `scripts/db/rodar-roteiros.sh` | **novo**, 147 linhas | o loop sai do YAML; CI e desenvolvedor chamam o mesmo código |
| `supabase/tests/_asserts.sql` | **novo** | `assert_zero_de`, que recusa universo vazio |
| `supabase/tests/asserts_ferramenta.sql` | **novo** | o autoteste da ferramenta, e a sentinela do carregamento |
| `supabase/tests/*.sql` (24) | contador + linha `FIM` | instrumentação; nenhum cenário mudou (§3.2) |
| `.github/workflows/ci.yml` | `cancel-in-progress` só em PR; `verificar:actions` depois do build; o passo dos roteiros chama o script | o CI pode reprovar. **Todos os comentários-cicatriz preservados** |
| `package.json` | `db:test`, `db:test:um`, `verificar:actions`; versão `1.50.0` | os três comandos que faltavam |
| `vitest.config.mts` | `test.projects`: `puro` e `componentes` | `.test.tsx` não casava `*.test.ts`; e `scripts/**` fecha o buraco |
| `src/components/layout/aviso.test.tsx` | **novo**, 5 casos | semente 1 |
| `src/components/layout/confirmacao-digitada.test.tsx` | **novo**, 5 casos | semente 2 |
| `src/components/layout/pagina.test.tsx` | **novo**, 5 casos | semente 3 |
| `src/lib/ci-passos.test.ts` | **novo**, 59 asserções | a trava |
| `src/lib/layout/consistencia.test.ts` | exclui `*.test.tsx` | a régua de layout não cobra arquivo de teste |
| `src/lib/dominio/cores.test.ts` | idem | a catraca não conta cor crua de fixture |
| `src/lib/ajuda/so-servidor.test.ts` | idem | — |
| `src/lib/use-server-exports.test.ts` | idem | — |
| `src/lib/ajuda/registry.test.ts` | idem (2 *call-sites*) | — |
| `.gitattributes` | o **motivo** escrito | a regra já estava lá; o porquê, não. E agora há um `.sh` no caminho crítico do CI |
| `CHANGELOG.md`, `src/lib/versoes/registry.ts` | versão `1.50.0` | regra 8 |
| `README.md` | Status, comandos, e a decisão do portão com data | o §5/Risco da ficha manda os dois lugares |
| `docs/DECISOES.md` | quatro atas | as três que a ordem exige, mais a do que não se conseguiu provar |
| `docs/PLAN-F45.md`, `docs/RELATORIO-F45.md` | **novos** | — |
| `docs/f45-evidencias/` | 8 arquivos | as provas |

**Nenhuma migration.** A última continua sendo a `0127`. **Nenhuma dependência nova.** **Nenhum
componente refatorado** — os três testados não tiveram uma linha alterada.

---

## 11. A revisão adversarial

Seis lentes independentes sobre o diff da fase (sintaxe/semântica de PL/pgSQL, cenário mudado,
runner linha a linha, a trava, o piso de componente e as varreduras, e a ficha do §5), cada achado
não-leve julgado por **três céticos** com lentes distintas, sobrevivendo só com dois votos de
"procede". **24 agentes, 511 chamadas de ferramenta.**

**Nenhum defeito de SQL, de runner ou de trava sobreviveu.** As lentes específicas para isso
verificaram e descartaram: `create or replace function pg_temp.…` é válido e sobrevive ao `rollback`
quando carregado antes do `begin`; a inserção do contador cai sempre em posição de instrução;
`v_ok`/`v_falhas` do bloco externo são visíveis nos sub-blocos com `declare` próprio; o
`set -u` do runner não estoura em `n_assercoes` (ela só é lida no ramo em que a linha FIM existiu);
e o `sed`/`grep` sobre "asserções" funciona por bytes UTF-8 mesmo em locale C.

O que **sobreviveu** foi documental, e foi corrigido antes do merge:

| Achado | Correção |
|---|---|
| `CHANGELOG.md` e a ata linkavam `docs/PLAN-F45.md` e `docs/RELATORIO-F45.md`, que não existiam | os dois documentos foram escritos (são estes) |
| a ata em `docs/DECISOES.md` estava só na árvore de trabalho, não no commit | comitada |
| comentários diziam "os 24 roteiros" quando já eram 25 | `rodar-roteiros.sh` e `ci-passos.test.ts` corrigidos |

E três achados **leves** foram examinados e **deliberadamente não corrigidos**, com o motivo:

- **`assert_zero_de` não é chamada por nenhum roteiro de produto.** É escopo (§4): converter as
  asserções tautológicas muda a força delas, e é matéria da fase seguinte do bloco A.
- **Três guardas de pré-condição não somam quando passam.** Deliberado (§3.3).
- **Sete roteiros têm `return;` precoce que agora reprovaria.** Comportamento desejado, e não deve
  acender no CI (§3.4).

---

## 12. Pendências, dívidas e próximos passos

### 12.1 Pendências da fase: NENHUMA

As duas que a primeira versão deste relatório listava fecharam no mesmo dia (§8.1). O portão está
ligado e provado; o SQL foi executado. **A partir daqui as ~30 travas do plano multiempresa
REPROVAM, em vez de informar** — que era o ponto inteiro desta fase.

Fica de pé só o que é característica do ambiente, não pendência de trabalho: **`npm run db:test` não
roda nesta máquina** por falta de Docker/Postgres (§9.1). Na máquina do Johnny, roda.

### 12.2 A proposta de grau 2 do teste de componente

O piso entregue é **grau 1**: HTML estático, sem interação. Ele cobre o que quebra em silêncio —
atributo de acessibilidade, `id` que não existe, estrutura de cabeçalho. **O que ele não cobre:**
clicar num botão, digitar num campo, abrir um diálogo, ver o estado mudar. Isso é o **grau 2**, e
custa três dependências novas:

| Dependência | Para quê | Tamanho |
|---|---|---|
| `jsdom` | um DOM em memória para o React montar de verdade | ~5 MB, dependência pesada |
| `@testing-library/react` + `@testing-library/user-event` | montar, consultar por papel/rótulo e simular interação como um usuário | ~1 MB |
| `@vitejs/plugin-react` | Fast Refresh e o transform completo (o esbuild sozinho basta para render, não para o resto) | pequeno |

**Todas MIT, todas gratuitas** — o custo não é dinheiro, é superfície: três pacotes a mais na stack
fechada, mais tempo de suíte (jsdom é a parte lenta de qualquer suíte de React), e uma segunda forma
de escrever teste de UI convivendo com a primeira.

**Por que ficou para depois do piloto:** a decisão 4 do plano fixa R$ 0 **e** estabilidade de stack
na preparação, e o grau 2 **não é pré-requisito de isolamento nenhum** — nenhuma das 27 fases
seguintes precisa dele. O que precisa delas é a fase do sistema de design, que vai escrever de 6 a 8
`.test.tsx` **usando exatamente o rig desta fase**. Se ali o grau 1 se mostrar insuficiente, aí sim
o pedido chega ao Johnny com evidência de uso, não com hipótese.

### 12.3 Backlog aberto por esta fase

- **Converter as asserções tautológicas** (`if v_n = 0 then ✓`) para `assert_zero_de`. São ~34, e é a
  fase seguinte do bloco A. Custo estimado: um dia, e ela precisa de banco para valer.
- **O runner não tem teste próprio.** `ci-passos.test.ts` cobra que o CI o chame e que ele contenha
  as regras; não cobra que a lógica dele funcione. Hoje isso é provado pelo dublê de `psql`, que
  vive fora do repositório (é script de fase). Transformá-lo em teste permanente custaria pouco e
  fecharia a última peça sem rede — mas é escopo novo, e a ficha nomeia só uma trava.
- **`docs/prompts/README.md` está desatualizado desde a F39** — não tem linha para F40, F41, F42,
  F43 nem F44. Esta fase acrescentou a da F45 e deixou as cinco anteriores como estavam: preencher o
  vão é entrega avulsa de documentação, não escopo desta ordem.
- **Nada no repositório defende a proteção da branch** (§12.4). Uma fase futura pode acrescentar uma
  checagem de rotina que leia `gh api …/branches/main/protection` e acuse se os dois checks saírem
  da lista. Não é trava (roda fora do CI, por definição), mas é uma sonda — e agora que se sabe que
  o `gh` está disponível, ela é barata.
- **Sete roteiros com `return;` precoce** agora reprovam em vez de passar em silêncio (§3.4). Isso é
  o comportamento certo; se acender no CI, é sinal verdadeiro.

### 12.4 O aviso que a ficha manda repetir

> A proteção da `main` é **configuração fora do repositório**, e **nenhuma trava interna a defende**.
> `src/lib/ci-passos.test.ts` protege os PASSOS do CI — não impede ninguém de desligar a proteção no
> painel do GitHub. Se ela for desligada, o repositório volta ao estado de 05/09/2026 sem que teste
> nenhum acuse. **Isso continua verdade mesmo agora que ela está ligada** — ligar não é o mesmo que
> defender. A única defesa possível é memória escrita: esta linha, a ata em `docs/DECISOES.md` e o
> bloco no `README.md`. Para conferir a qualquer momento:
>
> ```bash
> gh api repos/vmatusita/ti-wap-inventory-control/branches/main/protection --jq '.required_status_checks.contexts'
> ```

---

## 12.5 Os 15 critérios de aceitação, autoverificados

Saída em `docs/f45-evidencias/criterios-autoverificados.txt`. **Os quinze fecharam** — os quatro que
tinham ficado em aberto na primeira versão deste relatório foram fechados no mesmo dia, depois que o
`gh` apareceu (§8.1).

| # | Critério | Estado |
|---|---|---|
| 1 | Um commit que quebre roteiro SQL não chega em produção | ✅ **PR #21: `banco` ✗, merge `BLOCKED`, PR fechado sem mergear** (§8.5) |
| 2 | `verificar`/`banco` como *required checks* + PR + bypass | ✅ lido de volta pela API (§8.2) |
| 3 | `cancel-in-progress` em PR e **não** em push na `main` | ✅ — e a correção estava pela metade; ver §16 |
| 4 | `verificar:actions` no CI, depois do build, saindo 0 | ✅ verde no CI e local |
| 5 | `npm run db:test` usa o MESMO script do CI | ✅ o job `banco` chama `bash scripts/db/rodar-roteiros.sh` |
| 6 | Os roteiros terminam com `FIM`, e o runner falha sem ela | ✅ 25 linhas `FIM` no CI; e o PR #21 provou a falha |
| 7 | Nenhum roteiro conta zero asserção | ✅ **577 asserções**, a menor contagem é 4 |
| 8 | `assert_zero_de` recusa universo vazio, com teste | ✅ saída literal do CI, em §4 |
| 9 | `npm run test` executa `.test.tsx`; `puro` igual a antes | ✅ 16 em `componentes`; `puro` com os mesmos 149 arquivos |
| 10 | Varreduras verdes; `TETO_PALETA_CRUA` não subiu | ✅ 473/61, os mesmos |
| 11 | `lint`, `test`, `contraste`, `build`, `tsc --noEmit` limpos | ✅ os cinco, mais `verificar:actions` |
| 12 | Ata do portão em `DECISOES.md` **e** no `README.md`, com data | ✅ cinco atas |
| 13 | Regra 8: versão + registry + CHANGELOG + tag | ✅ `v1.50.0` e `v1.50.1`, as duas com tag |
| 14 | Rollout na ordem | ✅ merge → CI verde → tag → deploy READY → **proteção ligada por último** |
| 15 | Repouso perfeito | ✅ árvore limpa, nenhuma branch aberta, PR descartável fechado |

---

## 13. O rollout

Na ordem que o critério 14 manda — merge → CI verde → tag → deploy no ar → **e só então** ligar a
proteção.

| Passo | Resultado |
|---|---|
| Merge `--no-ff` na `main` | `29f252b`, `origin/main` em `feb2ba0..29f252b` |
| **CI do merge** | ✅ **`verificar` 4m31s · `banco` 3m19s** — run `34005294521`, os 25 roteiros, 577 asserções, 0 falhas |
| Tag anotada `v1.50.0` | publicada |
| **Deploy de produção** | **READY** — `dpl_63Q18LNwkeDL4ivveExcbt7yWj63`, aliado a `ti-wap-inventory-control.vercel.app`, build de 62 s, região `gru1` |
| **Smoke pós-deploy** | **108 OK · 1 aviso · 0 falha** — o aviso é o de sempre (`kits_modelos` · RLS não comprovada por não haver kit cadastrado) |
| Correção `v1.50.1` | `588195b`, CI ✅ 3m37s (run `34006187707`), tag publicada — ver §16 |
| **Branch protection** | ✅ **LIGADA** e lida de volta pela API (§8.2) |
| **Prova de que o portão fecha** | ✅ PR #21, `banco` ✗, merge `BLOCKED`, fechado sem mergear (§8.5) |
| Branches | `f45-portao` e `f45-prova-do-portao` apagadas nos dois lados — **repouso perfeito** |

---

## 14. O que o Johnny pode conferir com os próprios olhos

Nada aqui é bloqueio — as pendências fecharam. É auditoria.

1. **A proteção no painel:** *Settings → Branches → main*. Espere ver `verificar` e `banco` marcados,
   *Require a pull request* ligado, e **"Do not allow bypassing" DESMARCADO** (é o seu bypass).
2. **O PR #21**, fechado: o job `banco` vermelho e o aviso de merge bloqueado, do jeito que ficaram.
3. **`npm run db:test`** na sua máquina, com um Postgres à mão (§9.1) — é o ganho de ergonomia da
   fase, e é o único item que esta máquina não conseguiu exercitar.
4. **`git diff v1.49.1..v1.50.1`** para auditar o diff, e `docs/f45-evidencias/` para as sete provas.
5. **A §15**, que é sobre um erro meu, não sobre o sistema.

---

## 15. O erro deste relatório, e o que muda

**O que eu afirmei:** "o `gh` (GitHub CLI) **não está instalado** nesta máquina" — e, a partir daí,
que a configuração do portão era "insumo físico que só o Johnny tem", a exceção que o `CLAUDE.md`
prevê.

**O que era verdade:** o `gh` 2.100.0 estava instalado em `C:\Program Files\GitHub CLI\gh.exe`, com a
conta `vmatusita` autenticada e escopo `repo`. Bastava chamá-lo pelo caminho completo.

**Como o erro aconteecu, mecanicamente:** duas checagens, `which gh` no bash e `Get-Command gh` no
PowerShell. As duas resolvem por `PATH`. O diretório do `gh` não está no `PATH` que estas sessões
herdam — provavelmente porque o instalador o acrescentou depois de o ambiente da sessão ter sido
capturado. **Duas negativas pela MESMA razão não são duas evidências; são uma.** Eu li como duas.

**Por que passou:** a conclusão "não tem `gh`" caiu num encaixe confortável. A própria ordem da F45
previa esse desvio, com fallback escrito e tudo; o `CLAUDE.md` tem uma categoria pronta para ele
("insumo físico"); e o resultado era uma pendência bem documentada, que *parece* trabalho bem-feito.
Uma hipótese que se encaixa bem em três lugares ao mesmo tempo é justamente a que ninguém checa de
novo. **Foi um erro de omissão de segunda checagem, não de execução.**

**O custo real:** três coisas que dava para fazer na hora ficaram como tarefa do Johnny — ligar o
portão, provar que ele fecha, e ler o CI. E o relatório afirmou como impossível o que era só
inalcançável pelo caminho que eu tentei. Isso é pior do que não ter feito: é uma pendência falsa.

**O que muda, e é concreto:** "comando não encontrado" passa a ser hipótese, não conclusão. Antes de
declarar uma ferramenta ausente e desenhar um desvio em cima disso, a checagem é pelo **gerenciador
de pacotes** (`winget list`/`winget install`, que responde "já instalado") ou pelo **disco** (os
caminhos padrão de instalação), não só pelo `PATH`. Foi exatamente o `winget install` — que o Johnny
mandou rodar — que devolveu *"Found an existing package already installed"* e derrubou a conclusão
errada em quinze segundos.

Isto ficou registrado na memória do projeto e na ata de `docs/DECISOES.md`, com data.

---

## 16. O defeito que só o CI ao vivo mostrou — a correção estava pela metade (`v1.50.1`)

A F45 desligou o `cancel-in-progress` para push na `main`, e o relatório deu o buraco por fechado.
**Não estava.** Três minutos depois do merge, o próprio rollout produziu a prova do contrário:

```
$ gh run list --branch main
completed  success    docs(f45): a quarta defesa …            CI  main  push  34005635146  5m25s
completed  cancelled  docs(f45): os 15 criterios …            CI  main  push  34005575510  1m23s   ← !
completed  success    docs(f45): o rollout …                  CI  main  push  34005466001  4m31s
completed  success    merge(f45): o portao do CI fecha …      CI  main  push  34005294521  4m34s
```

O run `34005575510` (commit `dab346c`) foi **cancelado**, e `gh run view` mostra `jobs: []` — ele
nunca chegou a rodar um job. **Aquele commit ficou sem conferência nenhuma**, que é exatamente o que
a fase dizia ter consertado.

**A causa.** Desligar `cancel-in-progress` não basta, porque o **grupo** continuava sendo
`ci-${{ github.ref }}` — todos os pushes na `main` na mesma fila. E a regra do GitHub é: quando uma
execução entra na fila, a que estava **pendente** naquele grupo é cancelada. Com `cancel-in-progress:
false` a execução *em andamento* passou a sobreviver (isso a F45 acertou), mas a *pendente* continuou
sendo descartada. O buraco tinha mudado de forma, não sumido.

**A correção**, na `v1.50.1`:

```yaml
concurrency:
  group: ci-${{ github.event_name == 'pull_request' && github.ref || github.sha }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
```

Grupo **por SHA** em push: cada commit tem fila própria, não disputa, não fica pendente, não é
cancelado. Em PR o grupo continua por `ref` com cancelamento — é lá que ele é economia legítima.

`src/lib/ci-passos.test.ts` ganhou a asserção que faltava, e ela sabe ficar vermelha (conferido
devolvendo o grupo antigo: *"expected '  group: ci-${{ github.ref }}' to contain 'github.sha'"*).

**A lição, e ela é a mesma da §15 por outro caminho:** a leitura de código disse que o buraco estava
fechado; quem disse a verdade foi olhar a coisa rodando. É o argumento da fase inteira — uma trava
que não é observada é uma trava que se acredita, não que se sabe.
