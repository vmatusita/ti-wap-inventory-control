# RELATÓRIO F37 — Fundação: quem é a pessoa e o que é o item

> Ordem: [`docs/prompts/F37-fundacao-colaboradores-tipos-ultracode.md`](prompts/F37-fundacao-colaboradores-tipos-ultracode.md)
> (28/08/2026). Escopo fechado em [`docs/PLAN-F36-F39.md`](PLAN-F36-F39.md) §4 (decisões **D5**,
> **D6**, **D7**). Versão **1.42.0**. Migrations **`0112`**, **`0113`**, **`0114`**.
> Plano de execução em [`PLAN.md`](../PLAN.md).

---

## 1. O que faltava, em uma frase

A F38 e a F39 precisam de **uma pessoa que é sempre a mesma pessoa** e de **um tipo que é sempre o
mesmo tipo**. Nenhuma das duas coisas existia: colaborador era texto livre em três lugares e o
checklist de acessórios eram sete literais dentro de um arquivo `.ts`, sem espelho no banco.

Esta fase entrega **só a fundação**, e a régua dela é o que **não** mudou.

---

## 2. As contagens que motivaram a fase (produção, 28/08/2026)

| medida | valor |
|---|---|
| registros com nome de colaborador preenchido | **1.420** (1.412 em `movimentacoes` + 8 em `lancamentos_item`) |
| grafias **distintas** desses nomes | **956** |
| chaves distintas depois da normalização | **903** |
| grafias que a normalização junta | **53** |
| `ativos.colaborador_atual` preenchido | 1.241 |
| slugs de acessório realmente gravados no histórico | **3** — `cabo`, `carregador`, `mochila` (em `movimentacoes.itens_faltantes` **e** em `pendencias_item.item`) |

Os outros quatro slugs (`mouse`, `teclado`, `mousepad`, `fone`) existem só no código, à espera do
primeiro uso. Os sete entram no seed porque os sete são o vocabulário do checklist — semear só os
três criaria um catálogo que a tela de devolução contradiz no mesmo dia.

---

## 3. O modelo, e por que ele é assim

### 3.1 Híbrido: o registro novo grava os dois; o passado se resolve por chave

`guarda_acervo` (migration `0081`, corpo **lido do banco**, não da migration) recusa UPDATE em
`movimentacoes` e `lancamentos_item` **para todo mundo, service role incluso**:

```
raise exception 'Registro histórico não se altera: % é imutável…' using errcode = '42501';
```

Isso não é um obstáculo a contornar — é a doutrina da casa desde a F23. Logo:

- `colaborador_id` é gravado **só no INSERT do registro novo**;
- a tela de consolidação **cria cadastros**, nunca reescreve movimentação;
- a resolução do passado é **por `nome_chave` na leitura**.

### 3.2 O vínculo é resolvido no SERVIDOR

O desenho óbvio seria o campo devolver um id que viaja no payload do wizard. Ele foi **rejeitado**:
obrigaria a mexer no `Config`, no schema Zod, no rascunho do `sessionStorage`, no "repetir última",
nos kits e no resumo de revisão — e o critério 3 da ordem exige que os testes desses fluxos passem
**sem edição**.

O formulário continua falando **só em string**. O id é descoberto na Server Action, imediatamente
antes do INSERT, resolvendo a chave normalizada do próprio texto **numa consulta por lote**.

Efeito colateral bem-vindo: quem digitou `joão  silva` para o cadastro `João Silva` **também**
resolve. E a resolução **nunca lança** — falha de consulta devolve mapa vazio, o id fica nulo e a
movimentação é gravada assim mesmo.

### 3.3 A chave: onde a fase quase errou em silêncio

A expressão vive numa função IMMUTABLE nomeada, `public.colaborador_chave(text)`, usada pela coluna
gerada **e** pela view da fila. **Três** correções deliberadas ao DDL rascunhado no §4.1 do plano:

| # | rascunho do plano | o que entrou | por quê |
|---|---|---|---|
| 1 | `btrim` **dentro** do `regexp_replace` | `btrim` **fora**, depois do colapso | `btrim(text)` sem 2º argumento apara **só o espaço ASCII**: `E'\tJoão'` viraria `' joao'`, com um espaço grudado na chave |
| 2 | `'\s+'` | `'[ \t\n\r\f\v]+'` | **`\s` não é o mesmo conjunto nos dois lados.** No Postgres é `[[:space:]]` (sensível a locale); no JavaScript inclui **NBSP** (U+00A0) e vários espaços Unicode |
| 3 | (não existia) | `normalize(p_nome, NFC)` por dentro de tudo | Unicode tem **duas formas legítimas** para o mesmo nome: "João" do Windows vem precomposto (NFC, `ã` = 1 código); colado do macOS ou de certos exports vem decomposto (NFD, `a` + til combinante). A tabela de acentos só conhece a precomposta |

A #2 é a que teria falhado em silêncio; a **#3 já estava falhando**. As duas formas Unicode do mesmo
nome davam chaves diferentes — duas pessoas onde há uma, o defeito exato que esta tabela existe para
não ter. `normalize` é IMMUTABLE (conferido: `provolatile = 'i'`), então cabe na coluna gerada. Foi
corrigido **com a tabela ainda vazia**, o único momento em que sai de graça: mudar a expressão depois
recalcularia a coluna gerada de todas as linhas e poderia colidir no índice único.

**O efeito na base real, medido:** a fila de consolidação caiu de **904 para 903 grupos** — havia
mesmo um nome gravado em NFD que agora reconhece o gêmeo precomposto.

A #2 continua valendo pelo mesmo motivo: com a classe explícita os dois lados são idênticos **por
construção**, e é isso que faz a guarda TS↔SQL ser uma prova em vez de uma esperança. `ñ/Ñ` entrou na
tabela de acentos pelo mesmo cuidado.

Conferido contra o banco real, em transação desfeita:

| entrada | `nome_chave` |
|---|---|
| `'  João   Silva  '` | `joao silva` |
| `'JOAO SILVA'` | **colidiu** no índice único com a anterior |
| `'Ção Ñandú Ünico'` | `cao nandu unico` |
| `E'Maria\tdos\nSantos'` | `maria dos santos` |
| `E'João Silva'` (NFD) | `joao silva` — **igual** ao precomposto |

### 3.3.1 A divergência TS↔SQL que NÃO existe — medida, não argumentada

A revisão levantou que `lower()` do Postgres e `toLowerCase()` do JavaScript aplicam algoritmos de
case-folding diferentes fora do latino acentuado. A dúvida era legítima; a resposta saiu da máquina,
não do raciocínio — os dois lados foram executados sobre o mesmo corpus:

| caso | TS | SQL | |
|---|---|---|---|
| `İnönü Souza` (İ turco, U+0130) | `i̇nonu souza` | `i̇nonu souza` | igual |
| `Işık Alves` (ı sem ponto) | `işık alves` | `işık alves` | igual |
| `ΟΔΥΣΣΕΥΣ` (sigma final) | `οδυσσευς` | `οδυσσευς` | igual |
| `STRAßE Weber` (eszett) | `straße weber` | `straße weber` | igual |
| `Joao` + NBSP + `Silva` | mantém o NBSP | mantém o NBSP | igual |
| `Joao` + espaço fino + `Silva` | idêntico | idêntico | igual |
| `Joao` + zero-width + `Silva` | idêntico | idêntico | igual |
| `ИВАН Петров` (cirílico) | `иван петров` | `иван петров` | igual |
| `Joa` + til combinante + `o Silva` (NFD) | `joao silva` | `joao silva` | igual |

**9 casos, 0 divergências.** Note o NBSP: **nenhum** dos dois lados o colapsa — e é exatamente esse o
ponto da classe explícita. Não importa o que a função faz com um caractere estranho; importa que ela
faça **a mesma coisa dos dois lados**.

### 3.4 A consequência assumida

Duas pessoas reais com o mesmo nome normalizado **não cabem** no cadastro. A colisão vira frase em
pt-BR com as duas saídas que existem (diferenciar o nome, usar a matrícula) — nunca um `23505` cru
na tela. Ata em [`docs/DECISOES.md`](DECISOES.md).

---

## 4. O que NÃO mudou (conferido, não presumido)

| afirmação | prova |
|---|---|
| Nenhuma função ou trigger existente foi recriada | `git diff` nas migrations antigas vazio; nenhuma das três novas contém `create or replace` de função existente (`colaborador_chave` é **nova**) |
| Nenhum registro de acervo foi alterado | contagens de produção **idênticas** antes e imediatamente depois do apply: `ativos` 1616, `movimentacoes` 3429, `lancamentos_item` 30, `itens` 18, `pendencias_item` 17. Ver a nota abaixo sobre a leitura mais tardia |
| Nenhuma linha ganhou vínculo retroativo | `select count(*) from movimentacoes where colaborador_id is not null` → **0** logo após o apply |
| Nenhum teste existente foi editado para passar | os únicos `*.test.*` tocados são `registry.test.ts` (registrar as 2 rotas novas na matriz `COBERTURA`, que é o que o próprio teste exige) e `papeis_rls.sql` (asserções **novas** + as relações novas no bloco de grants) |
| Zero otimização entrou | `git diff` não mostra **nenhum** índice novo em `lancamentos_item` — a primeira versão da `0113` tinha um, e a revisão adversarial o derrubou (§5.5). Nenhuma paginação nova, nenhuma tabela de saldo, nenhum cache |
| Zero dependência nova | `git diff package.json` mostra **só** o campo `version` |

> **A conferência do fim do dia deu números DIFERENTES — e a diferença tem dono.** Ao fechar a
> fase, o acervo lido era `ativos = 1615` e `movimentacoes = 3428`, não os 1616/3429 da manhã.
> Perseguido até o fim, e **não é da F37**: às **18:50 UTC** um administrador resolveu um conflito
> entre filiais pela mesa de `/pendencias` — justificativa "Duplicado na planilha", patrimônio
> `TEC0012008` —, e a trilha em `eventos_admin` registra a operação com backup completo em jsonb.
> Ela apagou **1 ativo e 2 movimentações**. Depois disso, **1 movimentação** foi registrada
> normalmente. A conta fecha exata:
>
> `1616 − 1 = 1615` · `3429 − 2 + 1 = 3428`
>
> Ou seja: operação real, por gente real, no meio da fase — e a única razão de isso aparecer aqui é
> que a fase mede o acervo antes e depois. Uma leitura preguiçosa teria escrito "as contagens
> bateram" ou, pior, "o acervo mudou" — as duas erradas. Nenhum caminho desta fase escreve em
> `ativos`, `movimentacoes` ou `lancamentos_item` fora dos INSERTs do fluxo normal.

---

## 5. As provas executáveis

### 5.1 O roteiro novo — `supabase/tests/f37_colaboradores_tipos.sql`

**24 asserções, 0 falhas**, rodadas contra o banco **real** em `begin; … rollback;`:

- **a1–a8** — a chave normaliza (7 casos) e a **coluna gerada devolve o mesmo valor que a função
  chamada direto** — prova que a coluna usa a função, não uma cópia dela;
- **b1** — o índice único recusa a segunda grafia (`23505`);
- **c1** — nome em branco recusado (`23514`);
- **d1/d2** — o registro novo grava **as duas** colunas, em `movimentacoes` e em `lancamentos_item`;
- **e1/e2** — **a asserção negativa**: `update … set colaborador_id = …` é recusado pela
  `guarda_acervo`, **rodando como o DONO** e checando a mensagem (`%imutável%`). Como
  `authenticated` quem barra é a RLS — isso mediria a coisa errada;
- **f1/f2** — a view agrupa 3 grafias na mesma chave (`ocorrencias=3`, `grafias=3`) e vira
  `ja_cadastrado = true` quando o cadastro nasce. Filtrado **só pela chave fictícia**: contagem
  absoluta quebraria em qualquer base com dados;
- **g1–g5** — os 7 slugs, `fone` = "Fone de ouvido", o CHECK do formato e o unique do slug;
- **h1/h2** — `itens.tipo_id` anulável e a FK recusando tipo inexistente (`23503`);
- **i1** — **0 slugs órfãos** entre o histórico e `tipos_item`.

### 5.2 `papeis_rls.sql` — 74 asserções, 0 falhas

Dez asserções novas, cada uma na seção do cargo certo, com as duas tabelas **dentro do bloco de
grants** (a armadilha `42501` do runbook):

| # | o que prova |
|---|---|
| 1i / 1j | consulta ATIVO **lê** `tipos_item` e `colaboradores` |
| 1i-bis | consulta **não cria** colaborador |
| **2j** | **operador CRIA colaborador**, inclusive de filial **não vinculada** — se isto falhar, o campo do wizard quebra na mão dele |
| 3c-bis | operador **não cria** tipo de item |
| 3c-ter | operador **não edita** colaborador (por `row_count`, não por exceção: policy que não casa não levanta erro) |
| 4h / 4i | perfil **desativado** não lê nenhuma das duas — `tipos_item` é o caso perigoso, porque **tem seed**: uma policy escrita como `using (true)` daria 7 linhas e ninguém notaria |
| 5c-bis / 5c-ter | admin cria tipo e edita colaborador |

### 5.3 Todos os roteiros (regra F17)

Rodados contra o banco real, em transação desfeita: **19 dos 21 com 0 falhas**.

| situação | roteiros |
|---|---|
| **0 falhas** | `asof_desempate`, `cargo_dev`, `conflito_filiais`, `dominios_login`, `f34_triagem_reserva`, `f36_detentor` (depois do conserto do §5.6), **`f37_colaboradores_tipos` (24/0)**, `itens_extra`, `itens_quantidade`, `manutencao_fornecedor`, `maquina_estados`, **`papeis_rls` (74/0)**, `pendencias_import_termo`, `pendencias_item`, `reabrir_pendencia_item`, `seguranca_catalogo`, `transferencia_item`, `transicoes_extra` |
| **pulados de propósito** | `dev_destrutivo` e `import_substituir` — fazem reset global do acervo e chamam a RPC destrutiva do import; travariam as tabelas de produção pela duração da transação. Cobertos pelo job `banco` do CI |
| **falha por artefato de ambiente** | `troca.sql` — rebaixa a `admin` o primeiro `profile` que encontra, e em produção esse perfil é um `dev`: `profiles_guarda_dev` recusa. Idêntico antes e depois da F37; passa no banco limpo do CI |

> ⚠ **Uma nota de método que vale mais que o resultado.** A primeira rodada usou a técnica da F36 —
> trocar `raise warning '✗'` por `raise exception '✗'` para a falha atravessar a API. **Essa técnica
> INVERTE toda asserção que vive dentro de um `begin … exception when others`:** a exceção do ramo
> de falha é capturada pelo próprio handler e imprime o ✓. Descoberto aqui, corrigido aqui: as
> asserções passaram a ser **contadas** numa tabela temporária, cujo total volta como LINHA. Foi
> essa troca que revelou que 4 roteiros haviam falhado por um defeito da instrumentação (o texto
> `begin;` aparece **dentro de comentário** em vários deles) e não por defeito próprio.

### 5.4 As guardas TS↔SQL novas

- `src/lib/colaboradores/chave-sql.test.ts` (**19 asserções**) — extrai a tabela de acentos e a
  classe de espaço **direto da migration vigente** e compara com o TypeScript; recusa `\s`
  explicitamente; confere que os dois lados do `translate` têm o mesmo comprimento (um `para` mais
  curto **apaga** caracteres em vez de traduzi-los) e que o `btrim` vem depois do colapso.
- `src/lib/validators/tipos-item-sql.test.ts` (**12 asserções**) — os 7 slugs, os rótulos, a ordem,
  o formato e o "Fone de ouvido" nos dois lados.

### 5.5 A revisão adversarial — 6 lentes, cético por cima, 3 achados confirmados

Dez achados brutos; um cético independente tentou refutar cada um, com instrução de marcar
`real: false` na dúvida. **Sete caíram** (entre eles a divergência Unicode do §3.3.1, derrubada
depois por medição, e um sobre escape do `.in()` do PostgREST, derrubado por leitura do parser
oficial). **Três sobreviveram, e os três eram reais:**

| gravidade | o quê | o que foi feito |
|---|---|---|
| **alta** | A `0113` criava `lancamentos_item_colaborador_id_idx`. A ordem proíbe **nominalmente** "nenhum índice novo em `lancamentos_item`" (§Fora) e o critério 8 cobra `git diff` sem índice novo. Pior: a `0106` (F33/D3) já tinha investigado as FKs sem índice e deixado **esta tabela de fora de propósito**, e o §5 do plano-mãe **já reserva** esse índice para a fase seguinte, depois da medição | Os **dois** índices de `colaborador_id` removidos (o de `movimentacoes` junto, por coerência: nenhuma consulta desta fase filtra por ele) e derrubados do banco. A migration ganhou, no lugar deles, o parágrafo que explica por que não há índice ali |
| **alta** | `resumoDaConsolidacao` somava `ocorrencias` **paginando no cliente**, com o tamanho de página escrito à mão e **sem `order by`** — os dois defeitos exatos da v1.40.2. Um teto de servidor menor que a página faria o laço concluir na primeira volta e devolver uma soma menor **em silêncio** | A soma virou a view `v_colaboradores_consolidacao`: **no máximo duas linhas**, uma por `ja_cadastrado`. Nenhum teto de linhas alcança duas linhas. Era isso que "agregue no SQL" queria dizer |
| **média** | `listarColaboradoresAdmin`/`Ativos` pediam `.limit(2000)` contra um teto de servidor de 1.000 — o PostgREST corta **sem erro** | As duas passaram a usar `paginarTodos` (F19), que **observa** o teto entregue na primeira página e **lança** ao bater no cap, em vez de devolver número truncado. Com `.order()` de chave total (`nome`, `id`) |

### 5.6 Um defeito de OUTRA fase, achado por acidente e consertado

Ao rodar a bateria pela terceira vez, `f36_detentor.sql` falhou — tendo passado nas duas anteriores.
Medido: **2 falhas em 5 execuções**. A causa não era a F37 (`git diff` prova que nem o roteiro nem a
`0110` foram tocados):

> A guarda do estorno em `aplicar_movimentacao` recusa quando existe movimentação mais nova,
> comparando a **tupla `(created_at, id)`**. Dentro de uma transação `now()` é **constante**, então
> as duas movimentações do cenário `g` nasciam com o **mesmo `created_at`** — e o desempate caía no
> `id`, que é `gen_random_uuid()`, **aleatório a cada execução**. O cenário era cara-ou-coroa.

Isso torna o job `banco` do CI **vermelho ~40% das vezes**, por sorteio. Corrigido dando aos dois
INSERTs instantes explícitos e distintos: **8 execuções seguidas, 8 verdes**. Não é enfraquecer o
teste — é fazê-lo medir o que se propôs a medir, em vez de medir um uuid.

### 5.7 Portões

| portão | baseline (antes) | agora |
|---|---|---|
| `npm run lint` | limpo | **limpo** |
| `npm run test` | 128 arquivos · **2.609** testes | 130 arquivos · **2.646** testes |
| `npm run build` | limpo, 26 rotas | **limpo, 28 rotas** (as duas novas presentes) |
| `npm run db:types` | — | regenerado e commitado |

---

## 6. A medição (D6) — o que foi medido, e o que NÃO foi

### 6.1 O que não deu para fazer, e por quê

A curva dos três patamares exige um banco onde se possa **escrever 500 mil linhas**. Não havia um:

| peça | estado |
|---|---|
| projeto de **ensaio** (`sgmvldiizsrjbxzzpmhh`) | **INACTIVE**; `POST /restore` **recusado pelo classificador** (tentado nesta sessão) |
| produção | **proibida em hipótese nenhuma** (§C.2 da ordem) |
| Docker / `psql` / Supabase CLI local | ausentes |

**A curva é a pendência número um da fase.** O harness está escrito, guardado e pronto:

```bash
MEDIR_ITENS_CONFIRM=sim MEDIR_ITENS_REF=<ref-do-ensaio> node scripts/perf/medir-itens.mjs
```

### 6.2 As guardas do harness — provadas, não só escritas

São **três**, e a terceira é a que não depende de ninguém manter uma lista em dia:

1. **Lista de negação** (`REFS_DE_PRODUCAO`, espelho do `scripts/env-guard.ts`). Testado com
   `fetch` substituído por uma função que **lança** — se a guarda falhasse, nada aconteceria mesmo
   assim. Resultado: `[GUARDA] Execução recusada` **antes de qualquer chamada de rede**.
2. **Todo ref que ele encontra, não só o explícito.** Com `MEDIR_ITENS_REF` apontando para o ensaio
   e o `.env.local` desta máquina apontando para produção, ele **ainda recusa** — é a lição F11:
   comparar duas variáveis entre si é teste de *consistência*, não de *identidade*.
3. **A identidade, perguntada AO BANCO** (`assertBancoDeEnsaio`): `public.ambiente` declara
   `desenvolvimento`? É o mesmo sinal que faz `resetar_dados_ficticios` recusar em produção — e em
   produção a tabela está **vazia** (conferido). Ela é a **primeira chamada de rede** do script,
   antes de qualquer escrita (confirmado pelo stack trace do teste).

### 6.3 A âncora que FOI medida — volume de hoje, só leitura

`docs/perf/f37-ancora-producao.json`. 30 lançamentos, 18 itens, 3.429 movimentações.

| medida | conexão fria | conexão quente (mediana de 7) |
|---|---|---|
| `rel_saldo_itens(null, hoje)` | **53,3 ms** · 1.175 blocos | **1,88 ms** · 3 blocos |
| `rel_saldo_itens(1, hoje)` | 7,3 ms · 1.172 blocos | **1,18 ms** · 3 blocos |
| `rel_mov_itens(null, −30d, hoje)` | 10,9 ms · 1.107 blocos | **0,85 ms** · 7 blocos |
| histórico paginado (20 linhas) | 1,6 ms · 8 blocos | **0,21 ms** · 2 blocos |

**A leitura importa mais que os números.** `lancamentos_item` ocupa **uma página** de 8 kB
(medido: `n_live_tup` 30, `pg_relation_size` 8192). Os **1.100+ blocos** da coluna "fria" não são
agregação — são **compilação de plano e leitura de catálogo** de uma conexão nova. No volume de hoje
**não existe problema de desempenho de item**: existe custo de conexão.

### 6.4 O driver de escala, identificado por leitura do corpo vigente

| função | forma | custo |
|---|---|---|
| `valida_lancamento_item` (trigger, `0027`) | agrega **todo o diário do par (item, filial)** a cada INSERT, sob `pg_advisory_xact_lock` | inserir N linhas no mesmo par ⇒ **O(N²)**, serializado |
| `rel_saldo_itens` (`0027`) | varre `lancamentos_item where data <= p_ate` | **O(N)** por leitura |
| `rel_mov_itens` (`0027`) | varre a faixa de datas | O(linhas da faixa) |
| histórico paginado | `limit/offset` sobre índice existente | barato perto — mas `offset` profundo degrada linearmente |

### 6.5 As opções, nomeadas — e **nenhuma implementada**

Recomendação **para a fase seguinte**, não para esta:

| opção | quando o número recomendaria | custo |
|---|---|---|
| **Índice** em `lancamentos_item (item_id, filial_id)` cobrindo `tipo, quantidade, chamado` | se o trigger virar o gargalo antes da leitura | baixo, reversível — mas **não muda a ordem de grandeza** do O(N²) do trigger |
| **Paginação por cursor** (`(data, created_at, id) < …`) no lugar de `offset` | quando o histórico de uma filial passar de ~50 mil linhas | médio; muda a URL da tela |
| **Saldo materializado por item×filial**, mantido por trigger, com reconciliação | quando `rel_saldo_itens` passar de ~200 ms na conexão quente | **alto** — cria uma segunda fonte de verdade, contra a doutrina "o diário manda"; só com rotina de reconciliação e um teste que compare as duas contas |

**O que o número de hoje recomenda é: nenhuma delas.** 1,9 ms com o diário inteiro varrido é
folga de três ordens de grandeza. Otimizar antes do número é exatamente o erro que a F33 documentou
ter cometido e revertido.

---

## 7. Rollout

| passo | o quê |
|---|---|
| 1 | Ensaio das três migrations **contra produção em `begin; … rollback;`** (o projeto de ensaio está pausado) — conferências de policy, grants, view, seed e contagens |
| 2 | `0112` aplicada (0 colaboradores), `0113` aplicada (0 vínculos), `0114` aplicada (7 tipos) |
| 3 | `notify pgrst, 'reload schema'` |
| 4 | Contagens do acervo **relidas**: idênticas às de antes |
| 5 | `npm run db:types` regenerado (`--project-id`, Management API) e commitado |
| 6 | Roteiros SQL rodados contra o banco real (§5.3) |
| 7 | `lint` + `test` + `build` limpos; commit e tag `v1.42.0` |

**Ordem migration → deploy respeitada:** o SQL entrou antes do código, porque o código novo lê
colunas que só existem depois dele.

---

## 8. O que este relatório NÃO prova

1. **A curva de desempenho dos três patamares não existe.** É a pendência nº 1. O que está medido é
   a âncora do volume de **hoje** (30 lançamentos) — e nada permite extrapolar dela o comportamento
   em 500 mil. A recomendação do §6.5 vale como **hipótese**, não como conclusão medida.
2. **O harness nunca rodou.** Ele passa por `node --check`, teve as guardas de recusa provadas e a
   lógica revisada por leitura — mas nenhum patamar foi populado, nenhuma limpeza foi executada e o
   shape da resposta do endpoint da Management API está documentado como **suposição**.
3. **A equivalência TS↔SQL da chave é provada por construção e por corpus, não exaustivamente.**
   Os dois lados usam a mesma tabela de acentos e a mesma classe de espaço, e um teste extrai as
   duas do SQL. Para caracteres exóticos fora da tabela, `lower()` do Postgres e `toLowerCase()` do
   JavaScript **podem** divergir. O modo de falhar é o benigno (o vínculo não acontece, o texto é
   gravado), nunca um vínculo errado — mas não foi varrido caractere a caractere.
4. **Os roteiros SQL foram rodados por transação desfeita contra PRODUÇÃO**, não num banco limpo.
   Dois deles ficaram de fora (travariam tabelas de produção) e um falha por artefato de ambiente.
   **A prova final é o job `banco` do CI**, que sobe um Postgres novo e aplica `0001`→`0114`.
5. **Nenhuma tela foi aberta num navegador.** A verificação foi `build` + tipos + testes + as
   consultas que as telas fazem, executadas direto no banco. O smoke pós-deploy com as duas rotas
   novas é o que fecha essa lacuna, e ele depende do deploy.
6. **A consolidação em lote nunca foi executada com dados reais.** A fila foi medida (903 grupos,
   1.420 registros) e a action foi lida e tipada, mas ninguém clicou em "Cadastrar N selecionados"
   em produção. A primeira execução real deve ser feita com poucas linhas marcadas.
7. **O comportamento com mais de 500 grupos na fila não foi observado.** A tela avisa que a lista
   foi cortada e os números do resumo vêm somados do banco — mas o caso de 903 grupos (que é o real)
   não foi visto renderizado.

---

## 9. Pendências que a fase deixa nomeadas

1. **A curva de desempenho dos três patamares** (§6.1). Bloqueada pelo projeto de ensaio pausado —
   restaurá-lo é ação do Johnny, e depois disso é um comando só.
2. **`scripts/import/carga.ts`** (carga única do go-live, F4) não grava `colaborador_id`. Não é
   defeito: é ferramenta de go-live, fora do escopo desta ordem, e o vínculo daquelas linhas se
   resolve por chave na leitura como o de todo o histórico.
3. **`ativos.colaborador_atual` continua texto**, sem `colaborador_atual_id` — decisão explícita da
   ordem (exigiria recriar `aplicar_movimentacao`, e o híbrido não precisa disso).
4. **O checklist de devolução ainda mora no código** (`ACESSORIOS_DEVOLUCAO`). O espelho no banco
   existe e a guarda TS↔SQL trava os dois lados; a remoção da constante é da fase do termo.
5. **O padrão que causou o flake do §5.6 pode existir em outro roteiro.** Os outros nove que
   estornam movimentação passaram em três baterias seguidas e todos já referenciam `created_at`,
   mas ninguém os rodou dezenas de vezes atrás de sorteio. Regra para quem escrever roteiro daqui
   em diante: **duas movimentações do mesmo ativo na mesma transação precisam de `created_at`
   explícito e distinto**, senão o desempate cai num uuid aleatório.
6. **A fila de consolidação varre `movimentacoes` inteira** a cada carga da tela (3.429 linhas hoje,
   ~30 ms). Não é hot path, mas cresce linearmente — entra na mesma conversa do §6.5 quando houver
   número.
