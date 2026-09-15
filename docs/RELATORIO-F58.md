# Relatório F58 — A fronteira tipada do banco

**v1.63.0** · **sem migration** · 15/09/2026 · SHA de código congelado **`66b1571`** · branch `f58-fronteira-tipada-do-banco` · PR de código e PR de documentação (links no fecho da fase)

> Até aqui o TypeScript parava de conferir exatamente onde o dado entra: um `.rpc(` que aceitava `null` onde o SQL não
> aceita (e recusava onde aceita), um `(data ?? []) as X[]` que apagava o tipo que o `select` infere — 100 pontos —, e
> 132 `m.includes('texto')` que ninguém conferia contra o banco. A fase pôs as três fronteiras atrás de portas com tipo:
> `chamarRpc` (`src/lib/supabase/rpc.ts`), `linhasDe`/`linhaDe`/`valorDe` com a forma AMARRADA ao `select` e conferida em
> execução (`src/lib/supabase/linhas.ts`), e as frases de erro nomeadas e conferidas contra o corpo vivo das funções
> (`src/lib/supabase/erros-do-banco.ts`). Forma errada LANÇA (decisão i), e antes do merge cada forma passou pelas linhas
> reais de PRODUÇÃO, só leitura (decisão ii). Nenhuma tela mudou.

---

# 1. O ROTEIRO DO JOHNNY — o que ficou com você

*Nada aqui é pedido de autorização. É o olho humano sobre produção depois do deploy.*

*Nenhuma leitura de produção foi barrada nesta fase.* O censo, as quatro rodadas do conferidor e o `medir.mjs` rodaram contra
produção, todos só leitura, com a conta do smoke — não há comando pendente para você rodar antes de ler o resto.

### 1. Depois do deploy, em PRODUÇÃO — só olhar, sem gravar nada

Cada item abaixo passa por uma leitura que a fase trocou, e nenhum deles pode mostrar a tela de erro:

1. **Um relatório GERADO antigo** — `/relatorios/gerados`, abra o mais antigo da lista e um recente. É o snapshot
   congelado, lido pela forma frouxa que aceita todas as formas históricas (lote 4).
2. **A visão de uma filial numa data passada** — `/relatorios/<filial>` com uma data de semanas atrás. É a `rel_estoque_asof`,
   a do colaborador nulo para ativo em estoque (a mentira de retorno corrigida na porta).
3. **O CSV de ativos** — `/ativos` › Exportar. É uma leitura de lote, estrita.
4. **A ficha de um ativo** — abra um com termo gerado e movimentações. São a linha do tempo, os termos e os itens que foram junto.

### 2. Se alguma tela mostrar erro

Não reverta a fase. O log do servidor tem uma linha `leitura.<rótulo>` do `registrarFalha`, com o **rótulo da leitura** e o
**caminho do campo** que não bateu (`[].colaborador`, `dados.<chave>`) — nunca o valor. A correção é um PR pequeno no schema
daquela leitura, em `src/lib/queries/formas/<área>.ts`, com o caso no teste da forma. Reverter a fase inteira desfaria as
travas que acharam o problema.

### 3. Rodar `npm run test` e `npm run build` uma vez, na sua máquina

Sem banco. O total esperado está no §2.

---

# 2. Os números MEDIDOS, lado a lado com a ficha e a ordem

| Medida | Ficha / ordem | Antes (medido na `main` 86bd77d) | Depois (F58) | Como se mede |
|---|---|---:|---:|---|
| Chamadas de RPC em `src/**` fora da porta | "37 + 17" | **38** (37 + `validar-truncamento.ts`) | **0** | `rpc-unica-porta.test.ts` (AST, três grafias) |
| `as unknown as Json` | 15 | 15 (12 de RPC + 3 escritas de tabela) | **0** | `JsonSerializavel` + `paraJson` |
| Casts de leitura (`queries/` + `actions/` + os de fora) | ~50 / ~74 / ~84 | **100** em 85 funções (a trava) | **0** — `CONGELADOS` vazio | `sem-cast-de-leitura.test.ts` (AST, por escopo) |
| · lote 1 (`tipos-item` + `relatorios/**`) | — | 6 | 0 | |
| · lote 2 (resto de `queries/`, menos `gerados.ts`) | 57 | 58 (+ 7 de builder do backup) | 0 | |
| · lote 3 (`actions/` + os de fora) | 37 | 33 (+ 4 de segunda mão fora da trava) | 0 | |
| · lote 4 (`gerados.ts`) | 3 | 3 | 0 | |
| Casts de builder | 14 | 14 | **7** nomeados (5 `recorte-consulta.ts` + 2 `ativos.ts`) | decisão 7 |
| `z.custom` sem predicado (cast disfarçado, achado na revisão do lote 2) | — | 2 (introduzidos no lote 2) | **0** | `sem-custom-sem-predicado.test.ts` |
| Casamentos de erro por texto literal | 132 no `erros.ts` + "5 fora" | **132 + 23 fora**, em 7 arquivos | **0** | `casamento-por-texto.test.ts` |
| Ramos · grafias · nomes de constraint | 70 · 132 · 10 (+2) | 59 ramos · 112 grafias · 18 nomes | 59 · 112 (69 vivas + 43 gêmeas) · 18 — 5 grafias mortas saíram | `erros-do-banco-sql.test.ts` |
| Descritores no CATÁLOGO do conferidor | — | 0 | **114** (91 relações + 9 RPCs de leitura + 14 recibos) | `formas/catalogo.test.ts` |
| Testes (`npm run test`) | — | 201 arquivos · 5.104 | **216 arquivos · 5.828** | suíte inteira |

## 2.1 As oito divergências da ordem, e as duas que a ordem criou

A ordem já trazia oito divergências medidas contra a ficha. Cada uma foi remedida antes do primeiro commit em `src/`
(`PLAN-F58.md` §1), e o resultado é este:

| # | A ordem dizia (contra a ficha) | Medido na F58 |
|---|---|---|
| 1 | ~74 pontos de cast de leitura nas duas pastas, ~84 com os limítrofes e os de fora — não ~50 | **102 pontos** na exploração (`queries/` 65, `actions/` 32, **5** fora das duas pastas, não 2); a contagem OFICIAL é a da trava por AST: **100 casts em 85 funções**, hoje 0 |
| 2 | 10 chamadas `rel_*`, não 8; builder exigido por `Promise.all` e `.order().range()`, não `.single()` | **confirmada** — nenhuma chamada encadeia `.single()`; a porta devolve o builder por `.returns<>()` |
| 3 | três mentiras de argumento além do `filialParaRpc` | **confirmada**, com nuance: `p_backup_path` é opcional no gerador (`default null`); o `p_filial` do reset é obrigatório e não-anulável |
| 4 | dos 15 `as unknown as Json`, 3 são escrita de tabela e não somem com a porta | **confirmada** — as 3 saíram por `paraJson()` (`src/lib/supabase/json.ts`), não pela porta |
| 5 | o gerador mente também no RETORNO | **confirmada, e maior**: mais quatro além das citadas (`rel_estoque_asof.marca/modelo`, `devolver_ao_fornecedor.substituto_id/substituto_mov_id`, `ultima_migracao_aplicada`) |
| 6 | `erros.ts` com 70 ramos, 132 substrings, 10 nomes — não 63, ~110, 8 | **confirmada** na partida; depois: 59 ramos em `MSG_SQL` · 112 grafias · **18** nomes (os 6 a mais só casavam fora do `erros.ts`) |
| 7 | `toLowerCase()` na linha 21, não 20 | **confirmada** |
| 8 | cinco casamentos de erro por texto fora do `erros.ts`, além do `versao-snapshot.ts` (linha 44) | **23 em 7 arquivos** pela trava por AST (a exploração a olho tinha visto 14): 6 nomes de constraint novos e 3 regex sobre mensagem do Supabase Auth |

**As duas que a ordem criou, por decisão do Johnny (15/09/2026):**

- **(i) Forma errada LANÇA em produção.** A ficha não dizia o que fazer com dado de formato inesperado. Com a decisão, toda
  leitura migrada falha pelo caminho de falha que já tinha, com `registrarFalha` — e por isso a prova (ii) virou gate: um
  schema errado seria tela quebrada. **A nuance medida:** o RECIBO de uma RPC que escreve chega depois do commit; ali "lançar"
  diria ao operador que a operação não aconteceu. Os 14 recibos registram a falha e DEGRADAM para o padrão que a action já
  tinha, com `ok: true` (decisão 6).
- **(ii) A prova é contra PRODUÇÃO, só leitura, antes do merge.** O conferidor lê cada ponto do catálogo em produção, com a
  conta do smoke, e o merge espera 0 recusa, 0 erro e lidas = `count`. A rodada cedo achou recusa que o ensaio não mostraria
  (a pré-condição de filtro, §2.2 item 11) — é o argumento da decisão.

## 2.2 O que a medição achou além da ordem

Cada item abaixo é uma medição que contrariou a ordem, a ficha ou o próprio `PLAN-F58.md` — e ganhou, registrada aqui.

1. **Mentiras de RETORNO: mais quatro que as três citadas** — `rel_estoque_asof.marca/modelo`, `devolver_ao_fornecedor.substituto_id/
   substituto_mov_id` (nulos no caminho NORMAL de "devolver sem troca") e `ultima_migracao_aplicada`, além de
   `rel_estoque_asof.colaborador/setor`, `papel_atual` e `rotulo_de_ambiente`.
2. **Casamentos de erro fora do `erros.ts`: 23 em 7 arquivos**, não "5" — 6 nomes de constraint que só casam fora
   (`colaboradores_*`, `kits_modelos_nome_uidx`, `tipos_item_*`) e 3 regex sobre mensagem do Supabase Auth.
3. **Nenhum par com/sem acento existe inteiro no banco.** Cada `raise` usa uma grafia só, e nem sempre a acentuada. O plano
   dava "última movimentação efetiva" como só-histórica: a grafia VIVA é a sem acento (`0134`), e a acentuada é a gêmea.
   Mortas de verdade: 5 grafias (`D-traducoes-mortas.txt`).
4. **O teste das frases é por GRAFIA, não por ramo.** A regra "cada ramo tem ao menos uma grafia viva" (plano §6) deixava uma
   frase só histórica passar ao lado de uma viva — reprova agora com mensagem própria.
5. **O módulo das frases mora em `src/lib/supabase/erros-do-banco.ts`**, não em `src/lib/erros-banco/listas.ts` (plano §6): é a
   pasta da fronteira do banco, e `lib/relatorios/versao-snapshot.ts` também o consome.
6. **A réplica de nomes precisa da ORDEM DO TEXTO**: a `0091` apaga e recria o mesmo índice no mesmo arquivo; aplicar "todos os
   create, depois todos os drop" dava os dois índices de identidade do ativo como mortos. E a lista de colunas de um
   `create table` se parte por vírgula de PRIMEIRO NÍVEL, não por "vírgula + quebra de linha".
7. **`z.custom<T>()` sem predicado é um cast** — entrou no lote 2 em duas formas (`termos_gerados.dados`, `eventos_admin.detalhe`),
   saiu na revisão e ganhou trava própria.
8. **A ordem de uma RPC é lista de colunas**: `rel_saldo_colaborador` agrupa por item E filial.
9. **O count de RPC por HEAD não expressa `null`** (GET com os argumentos na query string) — as 21 células consolidadas das
   `rel_*` falharam na primeira rodada; POST com `range(0, 0)`.
10. **Coluna de ordem fora do `select`** não serve de chave para provar ordem total na linha — para relação, a ordem pela chave
    primária é total no banco.
11. **Pré-condição de filtro**: uma forma pode ser não-nula só porque o call-site filtra `.not(coluna, 'is', null)` — o descritor
    passou a declarar (`naoNulas`), achado pela rodada cedo em produção (2.093 + 3.247 recusas, nenhuma forma errada).
12. **O leitor de retorno `jsonb` contava o backup interno** (`select jsonb_build_object(…) into v_backup`) como variante — e o lote
    3 declarou tudo opcional para caber. Só o objeto DEVOLVIDO conta, e os recibos voltaram a provar chave obrigatória.
13. **Uma escrita do lote 3 dizia "não aconteceu" depois de acontecer** (`confirmarAssinaturaLote`, `UPDATE … RETURNING`) — as duas
    revisões pegaram; degrada como as outras.
14. **O kit com payload `null`** derrubaria a lista inteira com `z.looseObject({})` — virou `z.json()`, e o descarte por linha de
    `kitPayloadSchema` segue valendo.
15. **A varredura de evidências reprova por HOMÔNIMO, e isso custou um congelamento.** Depois das rodadas finais sobre
    `932665a`, a varredura acusou ocorrência em 10 arquivos — sempre a MESMA palavra comum da prosa do resumo do conferidor,
    que por acaso é nome de uma filial real. Nenhum dado vazou; a régua, porém, é zero ocorrência, e afrouxar a varredura
    (ou pôr a palavra numa allowlist) seria cegá-la. As duas mensagens impressas mudaram de palavra (`66b1571`) e as rodadas
    finais foram refeitas — a segunda das três que a ordem permite. **Lição para a próxima fase:** a varredura compara nome e
    slug de filial contra prosa livre, e nome de unidade em português colide com vocabulário técnico ("matriz", "serra");
    quem escrever saída de script deve preferir termo que não seja nome de lugar.
16. **Um script meu de diagnóstico imprimiu nomes de filial no terminal da sessão** ao montar uma expressão regular inválida —
    a mensagem de erro do Node ecoou a lista que estava em memória. Nada foi gravado em arquivo, commit ou evidência, e o
    diagnóstico seguinte passou a imprimir só `arquivo:linha`. Fica registrado porque a regra é sobre saída de script, não só
    sobre arquivo.
17. **O lado A do A/B não se constrói com `--env-file` nem com junção de `node_modules`** — o Next recusa `--env-file` em
    `NODE_OPTIONS` dos workers e o Turbopack recusa link para fora da raiz; `node_modules` por hard link e um lançador.

---

# 2.3 A revisão adversarial (Frente G, passo 2)

Quatro revisores em contexto fresco, cada um com um grupo das perguntas da ordem — (1) porta de RPC e mapas; (2) leitura,
casts e formas; (3) caminho de falha e frases de erro; (4) conferidor, evidência e escopo —, sobre `86bd77d...bb79e67`, e cada
achado entregue a um cético instruído a refutá-lo.

- **Três lentes sem achado**, cada uma com o que conferiu e os comandos (tsc, suíte inteira, a trava por AST com
  `IMPRIMIR_CASTS`, leitura dos corpos vivos de `rel_estoque_asof`, `devolver_ao_fornecedor`, `papel_atual`,
  `rotulo_de_ambiente`, `resetar_acervo`, `apagar_ativos_conflito_filiais` contra os mapas).
- **Um achado CONFIRMADO** (lente 2, não refutado): `acervoDosAtivos` (`queries/conflitos.ts`), o backup em ARQUIVO da exclusão
  de conflitos acima do teto, lia `select('*')` de cinco tabelas com `paginarTodos<unknown>` — sem forma, fora do catálogo do
  conferidor e fora da trava, que só procurava `as`. A ordem nomeia esses dois pontos entre os 16 `select('*')` de backup. O
  implementador do lote 2 o registrou como "fora do escopo" e a orquestração não o fechou — falha minha, pega pela revisão.
  **Corrigido** em `985ca1c` (tsc e lint limpos, suíte inteira 216 arquivos · 5.807 testes): cinco descritores frouxos no catálogo, `linhasDe`, os casos em `backup-frouxo.test.ts`, e a
  trava de cast ganhou a outra grafia do mesmo cast (argumento de tipo que apaga a linha num produtor de linhas). Nenhum outro
  ponto de `src/` casa a regra nova — todos os tipos nomeados passados como argumento a `paginarTodos`/`paginarPorIds` foram
  conferidos sem propriedade opcional.
- **Re-revisão focada, rodada 1** (duas lentes em contexto fresco + um cético por achado, sobre `985ca1c`): a lente "a correção"
  confirmou que o backup em arquivo manteve as cinco tabelas, o recorte, a ordem e o formato que `actions/conflitos.ts` consome
  (conferido contra as migrations `0003`/`0017`/`0021`/`0050`), e achou **um furo na regra nova, CONFIRMADO**: `apagaALinha` lia
  só a sintaxe do argumento, e `type Linha = unknown` (ou `interface` com opcional, ou alias para `Record<string, unknown>`)
  passado como `paginarTodos<Linha>` escapava — latente, nenhum ponto de `src/` usava a indireção. A lente "leitura sem forma
  em qualquer lugar de `src/`" **não achou nada**: os 25 `select('*')` (9 contagem/HEAD, 16 com forma frouxa), todo `as unknown`,
  `JSON.parse`, parâmetro `unknown` e `Record<string, unknown>` fora de teste, e os ~30 call-sites de `chamarRpc`/`.from`.
  **Corrigido** em `fece834`: a trava resolve o nome (escopo, import, barril, alias genérico, `extends`, utilitários), 14 casos
  novos que casam e 7 que não casam; com a resolução desligada, 12 ficam vermelhos (`C-sabotagem-alias-na-trava.txt`). Suíte
  inteira 216 arquivos · 5.828 testes, tsc e lint limpos.
- **Re-revisão focada, rodada 2** (sobre `fece834`: o que ainda escapa × a implementação da resolução): **6 achados, 5
  confirmados e 1 refutado** por implausibilidade (barril que reexporta um `export default` — nenhum em `src/`). Os cinco: import
  default e `export default` não eram seguidos; `export { X as Y }` de declaração LOCAL só era procurado em import (o padrão
  existe em `src/components/ui/chart.tsx`); `namespace` do próprio arquivo não era visto; e assinatura de índice, `Record` e tipo
  mapeado decidiam só por `unknown`/`any` escritos — quando a CHAVE ABERTA já deixa `r.empresa_id` compilar com qualquer valor.
  A lente de implementação conferiu a ordem de escopo, a substituição genérica e o cache sem achado além desse. **Corrigidos os
  seis** em `92bb4fe`: 18 casos de guarda novos (8 entre arquivos, com módulos em memória); com as cinco regras
  desligadas, 10 ficam vermelhos (`C-sabotagem-alias-na-trava.txt`). Suíte 216 · 5.846, tsc e lint limpos.
- **Re-revisão focada, rodada 3** (sobre `92bb4fe`: as regras novas, falso positivo e negativo × robustez): **4 achados, 2
  confirmados e 2 refutados** por implausibilidade (`class` como tipo de linha; chave de template literal — agora declarados no
  "o que ela não resolve" do teste). Os dois confirmados são a mesma falha: seguindo um nome até um módulo ALHEIO, uma declaração
  PRIVADA de mesmo nome escondia a que o módulo exporta por `export { Linha } from` (e o mesmo com `namespace`). A lente de
  regras novas confirmou 0 falso positivo sobre `src/**`. **Corrigido** em `cfa5ef7`: de módulo alheio só vale o que ele
  exporta; o namespace segue `import { Grupo }`, `export { Grupo } from` e `export * as`; 5 casos novos entre arquivos (75 no
  arquivo); com o filtro desligado, 3 vermelhos. Suíte 216 · 5.851, tsc e lint limpos.
- **Re-revisão focada, rodada 4** (sobre `cfa5ef7`: a visibilidade de export e o que ainda escapa): **1 achado, confirmado** —
  `import('./mod').Nome` escrito no próprio argumento é outro nó de AST (`ImportTypeNode`) e não chegava a nenhuma das
  resoluções; o cético provou com o `tsc` que a coluna ausente compila, e o tipo do exemplo é o mesmo `ContextoFalha`
  (`Record<string, unknown>`) que o teste já usa. A lente conferiu também que a mudança da rodada 3 não criou falso negativo
  (`export { Linha }` local, `export default interface`, `.d.ts`) nem falso positivo em `src/**`. **Corrigido** em
  `932665a`: o `import(…)` inline percorre a mesma cadeia, inclusive `import('./mod').Grupo.Nome` e na chave de um
  `Record`; 5 casos novos (80 no arquivo). Suíte 216 · 5.856, tsc e lint limpos; com os dois ramos desligados, 3 vermelhos.
- **Re-revisão focada, rodada 5** (sobre `932665a`, com a régua explícita de plausibilidade — só é achado o que alguém
  escreveria NESTE repositório para tipar uma linha): **nenhum achado**. O que ela conferiu, e é a prova de que a trava não
  virou barulho: a varredura real de `src/**` devolve o mapa VAZIO (nenhum falso positivo) e o arquivo passa 80/80; **todos** os
  tipos nomeados passados hoje a `paginarTodos`/`paginarPorIds` foram abertos um a um (`Row` de colaboradores, `LinhaSerieCurta`,
  `LinhaAtivo`, `Linha`, `LinhaChamado`, `LinhaMov`, `LinhaEnvio`, `AnotRow` e os inline de conflitos, import-logs e relatórios)
  — nenhum tem propriedade opcional nem assinatura de índice, todo campo anulável usa `| null`; e não existe produtor de linhas
  escondido: os únicos são `paginarTodos`/`paginarPorIds`, e nenhuma função da casa devolve linha crua sem passar por `.map` ou
  por `linhasDe`. Coleta em 2,9–5,2 s.

**O saldo das seis rodadas de revisão** (1 adversarial + 5 focadas): 12 achados julgados por céticos, **9 confirmados e
corrigidos**, 3 refutados (barril com `export default`, `class` como tipo de linha, chave de template literal — os dois últimos
declarados por nome no que a trava não resolve). Oito dos nove estavam na mesma peça: a resolução de nome da trava de cast.

# 3. O que mudou, por arquivo e por quê

`git diff --stat main..HEAD`: **108 arquivos em `src/` e `scripts/`**, +9.496 −1.097, mais `package.json` e `CHANGELOG.md`.
Nenhum arquivo em `supabase/migrations/`, `supabase/migrations.lock.json` ou `src/lib/types/database.ts`.

**Frente B — a porta.**
- `src/lib/supabase/rpc.ts` (novo): `chamarRpc` e os três mapas. `src/lib/supabase/json.ts` (novo): `JsonSerializavel`/`paraJson`.
- `src/lib/queries/rpc-filial.ts` **apagado** — `filialParaRpc` e os três casts iguais escritos à mão sumiram.
- As 37 chamadas de `actions/`, `queries/` e `auth/`, e `scripts/manutencao/validar-truncamento.ts`, passam pela porta.
- Travas: `rpc-unica-porta.test.ts` (AST, três grafias, `scripts/**` com isenção nominal) e `rpc-mapas-sql.test.ts`.

**Frente C — a leitura, em quatro lotes.**
- `src/lib/supabase/forma.ts` (a amarração e o erro de forma), `linhas.ts` (`linhasDe`/`linhaDe`/`valorDe` e as variantes
  `…OuFalha`, com `exigirModo`), `leitura.ts` (os descritores), `enums.ts`, `colunas-de-view.ts`.
- `src/lib/queries/formas/` (novo): um arquivo de descritores por superfície e `catalogo.ts`, o que o conferidor lê. Os `select`
  moram lá como literais.
- Lote 1 `tipos-item` + `relatorios/**`; lote 2 o resto de `queries/` (menos `gerados.ts`); lote 3 `actions/` e os de fora
  (`app/(app)/page.tsx`, `app/(app)/dev/acoes-export.ts`, `ativos/identidade.ts`, `auth/acesso.ts` — `lerPapel` por
  `valorOuFalha`); lote 4 `gerados.ts` (o snapshot, frouxo, união das versões).
- Travas: `sem-cast-de-leitura.test.ts`, `sem-custom-sem-predicado.test.ts`, `linhas-tipos.test.ts`, `linhas-sem-valor.test.ts`,
  `backup-frouxo.test.ts`, `formas/catalogo.test.ts`, `formas/rpc-retorno-sql.test.ts`, `colunas-de-view-sql.test.ts`.
- `relatorios/comum.ts`: `paginarTodos`/`paginarPorIds` passaram a inferir a linha do builder — **sem** `cap`, keyset ou cache
  (F60).

**Frente D — as frases de erro.** `src/lib/supabase/erros-do-banco.ts` (novo) com `erros-do-banco-sql.test.ts` e
`casamento-por-texto.test.ts`; `actions/erros.ts` reescrito com a mesma ordem de ramos; os 23 casamentos de fora em
`admin.ts`, `itens.ts`, `dev.ts`, `colaboradores.ts`, `kits.ts`, `tipos-item.ts` e `relatorios/versao-snapshot.ts`.
`docs/RUNBOOK-BANCO.md` ganhou a lição do enum.

**Frentes E e F — a prova e o custo.** `scripts/formas/censo.mjs`, `conferir.mts`, `resumir-conferidor.mjs` e
`varrer-evidencias.mts`; `scripts/perf/bench-formas.mts`, `medir-local.mjs`, `ab-local.mjs` e `lancar-com-env.mjs`.

**Frente G.** `package.json` 1.63.0, a entrada do `registry.ts` e do `CHANGELOG.md`.

**Testes que já existiam e mudaram** — cada um continua provando a mesma coisa, conferido linha a linha:
- `actions/admin.test.ts` e `actions/dev.test.ts` procuravam `.rpc('nome'` no texto da action para provar que cargo, vínculo,
  status e exclusão são gravados com o client de SESSÃO; passaram a procurar `chamarRpc(supabase,'nome'` (e `chamarRpc(admin,`
  no negativo). A prova é a mesma — o client de sessão, nunca o administrativo —, e cada um ganhou a asserção de que o arquivo
  não tem mais `.rpc(` direto.
- `actions/importar.test.ts` prova a ORDEM (backup antes da RPC de substituição); só a grafia procurada mudou.
- `queries/relatorios/fronteira-viewer.test.ts` mantém a lista branca de RPCs que o visualizador por senha alcança; o detector
  aprendeu a segunda forma (`chamarRpc(client, 'nome', …)`, nome como 2º argumento) sem deixar de reconhecer `.rpc(`, e segue
  recusando nome por variável, template ou concatenação — com casos novos para as três fugas na forma da porta. Sem isso, a
  lista branca ficaria cega para toda superfície migrada.

# 4. O mapa das mentiras e o censo (só números)

O detalhe, com a evidência de cada entrada no corpo vivo, está em `PLAN-F58.md` §2. Aqui, só a forma e os números.

**Argumentos que o app passa `null` de propósito** (`ARGUMENTOS_ANULAVEIS`, `rpc.ts`) — 11 funções, 11 entradas: as sete `rel_*`
(`p_filial` = consolidado, uma constante só, `RECORTE_DO_RELATORIO`, a linha que a F60 troca), `previa_reset`/`resetar_acervo`/
`resetar_itens` (`p_filial` = alcance global) e `apagar_ativos_conflito_filiais.p_backup_path` ("sem arquivo" até 25 ativos).
Nenhuma é `strict`; cada evidência é conferida fora de comando com `raise` (a sabotagem B1 é justamente o `p_contagens` que
só aparece dentro de `raise`).

**Retornos que saem `null` e o gerador diz que não** (`COLUNAS_DE_RETORNO_ANULAVEIS` e `ESCALARES_ANULAVEIS`) — 6 colunas em 2
funções e 3 escalares:

| Função | Coluna/escalar | Censo de produção (15/09) |
|---|---|---|
| `rel_estoque_asof` | `colaborador` · `setor` | hoje 1.472 e 1.445 nulos em 1.611 linhas; 180 dias atrás, 958 e 959 em 959 |
| `rel_estoque_asof` | `marca` · `modelo` | 0 e 11 nulos (no ensaio, 4 e —) |
| `devolver_ao_fornecedor` | `substituto_id` · `substituto_mov_id` | RPC que escreve — provada pelo SQL, nunca chamada |
| `papel_atual` · `ultima_migracao_aplicada` · `rotulo_de_ambiente` | escalar | — |

**Colunas de view que o gerador diz anuláveis e o SQL garante não-nulas** (`COLUNAS_DE_VIEW_NAO_NULAS`, `colunas-de-view.ts`) —
só as que alguma leitura migrada estreita, cada uma com o trecho da definição viva e 0 nulos no censo de produção. Duas
candidatas exigiam prova semântica e ficaram de fora (`v_fila_pendencias.pendencia` e `desde`).

**O censo** (`scripts/formas/censo.mjs`, só leitura, identidade conferida antes do primeiro `select`):

| | Ensaio | Produção |
|---|---:|---:|
| relações lidas por `src/**` | 29 | 29 |
| linhas somadas | 6.000 | 7.032 (+16 de `anotacoes`, recontada após falha transitória) |
| `movimentacoes` · `ativos` · `v_colaboradores_textos` | 3.245 · 1.606 · 780 | 3.553 · 1.620 · 918 |
| `v_conflitos_filiais` · grupos | 0 · 0 | 138 · 68 |
| `relatorios_gerados` | 1 | 13 |
| `lancamentos_item` · `termos_gerados` · `eventos_admin` | 35 · 2 · 0 | 142 · 106 · 100 |
| `statement_timeout` | nenhum | nenhum |

Onde o seed não representa produção — zero conflitos, zero colaboradores cadastrados, zero eventos administrativos, um
snapshot — é exatamente onde a forma real mais podia surpreender; por isso a prova que vale é a de produção.

# 5. As nove decisões, com o custo que decidiu cada uma

A ata completa está em `docs/DECISOES.md` ("F58 · As nove decisões da fase", "O que a revisão do lote 2 mudou" e "As frases de
erro do banco"). Em uma linha cada, com o custo que decidiu:

| # | Decisão | O custo que decidiu |
|---|---|---|
| 1 | **A porta** — `chamarRpc` em `src/lib/supabase/rpc.ts`, sem `server-only`, devolvendo o BUILDER por `.returns<>()` | `.overrideTypes()` devolve builder terminal e quebraria as 10 `rel_*` paginadas e os `Promise.all`; `.returns<>()` está obsoleto, e a troca futura é uma linha |
| 2 | **O mapa das mentiras** — três mapas NOMINAIS `{ motivo, evidencia }`, conferidos contra o corpo/definição viva | derivar do gerador é impossível (é ele quem mente); nominal deixa a F60 trocar `p_filial` numa linha |
| 3 | **O `Json` tipado** — `JsonSerializavel` nos argumentos da porta e `paraJson()` nas 3 escritas de tabela | zero `as unknown as Json`; cada payload ganhou tipo de domínio |
| 4 | **A amarração** — `forma: F & ConfereLinha<L, F>`, com `Recusa<'motivo'>` legível no `tsc`; select não literal recusa | as provas `@ts-expect-error` de `linhas-tipos.test.ts` viram a sabotagem C1 permanente |
| 5 | **O modo por categoria** — colunas explícitas → estrito (inclusive lote); `select('*')` → frouxo obrigatório; `z.object` padrão recusado em execução | benchmark antes do lote 2: estrito × frouxo em 1.620 ativos, 1,97 × 1,49 ms; 16.200, 15,3 × 15,0 ms — ruído perto de TTFB de 200–470 ms |
| 6 | **O erro de forma** — `ErroDeForma` (`F58_FORMA`), caminho normalizado, ≤ 5 problemas, nenhum valor; LANÇA onde a leitura propagava; recibo de escrita degrada | a decisão i; e o recibo pós-commit não pode dizer "não aconteceu" |
| 7 | **Os casts de builder** — 7 ficam nomeados (`recorte-consulta.ts` 5, `ativos.ts` 2), os 7 de `dev-destrutivo.ts` saem | os que ficam apagam o tipo do BUILDER para reusar filtro (decisão da F57); os que saíram apagavam a LINHA |
| 8 | **As listas de erro** — `erros-do-banco.ts` com nomes inteiros e tipados; teste por GRAFIA contra o corpo vivo e a réplica ordenada | 8.085 casos de equivalência: só as 5 grafias mortas e os 2 prefixos soltos mudaram de tradução |
| 9 | **O conferidor e a medição** — importa o CATÁLOGO, identidade antes da leitura, chamáveis tirados do corpo vivo; A/B com a `main` em worktree com `node_modules` por hard link | três tentativas registradas para construir o lado A sem copiar o `.env.local` |

# 6. As sete sabotagens, com a saída real

Cada sabotagem foi aplicada por script, com o sha256 do arquivo conferido antes e depois da restauração, e a saída real
gravada em `docs/f58-evidencias/`. Nenhuma rodou contra produção.

| | Sabotagem (texto da ordem) | O que se quebrou | Quem acusou | Evidência |
|---|---|---|---|---|
| **A** | `.rpc(` direto numa query; o mesmo com `['rpc'](` e com `rpc` desestruturado; tirar um `.ts` de `scripts/` da isenção | A1–A3 em `queries/tipos-item.ts`; A4 tira `scripts/reset.ts` da isenção | `rpc-unica-porta.test.ts` vermelho nas quatro, nomeando `src/lib/queries/tipos-item.ts:87 (.rpc)` / `(['rpc'])` / `({ rpc })` e `scripts/reset.ts:56` | `A-sabotagem-porta-unica.txt` |
| **B** | pôr no mapa um parâmetro que NÃO trata `null` como domínio; tirar `p_filial` de uma `rel_*` | B1 põe `resetar_acervo.p_contagens` (o corpo vivo da `0089` faz `if p_contagens is null or jsonb_typeof(p_contagens) <> 'object' then raise`); B2 tira `rel_resumo` | B1: `rpc-mapas-sql.test.ts` — "toda ocorrência da evidência está num comando com `raise` — é recusa, não domínio"; B2: `tsc` — `relatorios/movimentacoes.ts(120,5): error TS2322: Type 'number \| null' is not assignable to type 'number'` | `B-sabotagem-mapa-de-anulaveis.txt` |
| **C** | schema com `empresa_id` sobre `select` sem ele (a prova central); `(data ?? []) as X[]`; o mesmo com `{ data: linhas }` | C1: cópia de `linhas-tipos.test.ts` SEM as 19 diretivas `@ts-expect-error`, compilada pelo `tsc` do projeto; C2/C3 em `queries/filiais.ts` | C1: **11 erros** do `tsc`, entre eles `Property 'empresa_id' does not exist on type 'LinhaConferida<…>'` e `Recusa<"a forma declara colunas que o select não traz: empresa_id">`; C2/C3: `sem-cast-de-leitura.test.ts` vermelho nomeando a função | `C-controle-positivo-amarracao.txt`, `C-sabotagem-cast-de-leitura.txt` |
| **C′** | (as re-revisões) o mesmo apagamento atrás de um NOME — quatro rodadas de correção, cada uma com a sua sabotagem | rodada 1: a resolução de nome desligada; rodada 2: as cinco regras novas (import default, índice, chave de `Record`, namespace local, rename local); rodada 3: o filtro "só o que o módulo exporta"; rodada 4: os dois ramos do `import(…)` inline | 12, 10, 3 e 3 casos vermelhos, e os que continuam verdes se decidem por caminho que cada sabotagem não tocou | `C-sabotagem-alias-na-trava.txt` (as quatro rodadas, com a saída de cada uma) |
| **D** | objeto frouxo de backup trocado por `z.object` padrão | D1 no backup de ativos da Zona destrutiva; D2 repete com a guarda de modo desligada | D1: a guarda `exigirModo` de `linhas.ts` recusa antes de conferir ("O z.object padrão REMOVE coluna em silêncio"); D2: `backup-frouxo.test.ts` — `expected undefined to be 'dado-que-nenhuma-forma-declara'` | `D-sabotagem-backup-frouxo.txt` |
| **E** | tirar `colaborador` do alargamento de `rel_estoque_asof` → `tsc` ou teste vermelho, e o conferidor no ENSAIO acusa recusas | E1 tira `colaborador` de `COLUNAS_DE_RETORNO_ANULAVEIS.rel_estoque_asof`; E2 soma a isso o "conserto" que calaria o call-site — a forma com `colaborador: s`, o que o gerador afirma (worktree temporária no SHA congelado `66b1571`) | E1: `tsc` exit 2 — `relatorios/estoque.ts(123,35)` e `linhas-tipos.test.ts(130,18)` com `Recusa<"o tipo destas colunas diverge do select: colaborador">`, e `(132,3): Unused '@ts-expect-error'`; E2: `tsc` segue vermelho na prova de tipo, e o conferidor no ENSAIO reprova **15 células** de `rel_estoque_asof` com **3.326 recusas, todas `[].colaborador invalid_type`**, 0 erro, lidas = count; nenhum outro ponto muda | `E-sabotagem-mentira-de-retorno.txt` (+ o JSON da rodada) |
| **F** | ligar `reportInput`; interpolar valor na mensagem; chave dinâmica de `jsonb` crua no caminho | F1, F2, F3 em `supabase/forma.ts` | `linhas-sem-valor.test.ts`: F1 3 vermelhos, F2 4, F3 2 — `vazou "…"` com as sentinelas FICTÍCIAS do teste, e `expected 'contagens.CHAVE_SENTINELA_DE_ITEM' to be 'contagens.<chave>'` | `F-sabotagem-valor-no-erro.txt` |
| **G** | `m.includes('texto solto')` no `erros.ts`; item de `MSG_SQL` só em corpo HISTÓRICO | G1 devolve `'saldo insuficiente'` (existe nas `0015`/`0019`/`0024`, só em corpo substituído); G2 um `includes` solto; G3 o prefixo antigo `lanc_item_estorna` no lugar do índice | G1: `erros-do-banco-sql.test.ts` — "só existe num corpo HISTÓRICO"; G2: `casamento-por-texto.test.ts`; G3: "lanc_item_estorna não existe no esquema que as migrations produzem hoje" | `G-sabotagem-erro-enumeravel.txt` |

Uma prova a mais, da Frente E (não é a sabotagem E da ordem): a pré-condição de filtro `naoNulas` — tirá-la da sugestão de
colaborador, ou declarar uma coluna que o call-site não filtra, deixa `formas/catalogo.test.ts` vermelho
(`E-sabotagem-precondicao-nao-nulas.txt`).

# 7. O conferidor — as rodadas

## 7.1 As rodadas cedo (SHA `910d7cf`, lotes 1 e 2 + Frente D; worktree temporária, script ainda não versionado)

**Ensaio, 1ª tentativa** — leu tudo e perdeu o resultado: `--saida` absoluto era juntado à raiz do repositório, e a escrita
falhou depois da última leitura. Conserto: o resumo por ponto passou a ir para a tela ANTES de gravar.

**Ensaio, r1** — 214 pontos, 76.605 linhas, 35 reprovados, e nenhum deles era forma errada:
- **20 relações "com ordem não total"** — artefato do conferidor: a coluna de ordem (`id`) não está no `select` daquelas
  leituras, e toda linha dava a mesma chave (`undefined`). Conserto: a prova por chave só vale quando a coluna volta na
  linha; para relação, a ordem pela chave primária é total no banco e o método fica registrado (`ordem_provada`); para RPC,
  coluna de ordem ausente é erro de descritor.
- **21 células consolidadas das `rel_*` com `count: ?`** — o count ia por HEAD, que viaja por GET com os argumentos na query
  string: `p_filial: null` não se expressa ali, e resposta HEAD não tem corpo. Conserto: POST com count exato e `range(0, 0)`;
  o erro passou a levar o status HTTP.
- **2 formas de sugestão** (abaixo).

**Ensaio, r2** — 214 pontos (67 relações, 147 células de RPC), 78.716 linhas, **0 erro, lidas = count em todos**, 14 relações
com a ordem provada pela chave primária, **2 reprovados**. E um buraco do próprio conferidor: `rel_saldo_colaborador` não gerou
célula nenhuma (o ensaio não tem pessoa cadastrada) e o descritor sumiu da rodada sem marca. Conserto: matriz sem célula vira
ponto NÃO PROVADO, e descritor que não leu linha nenhuma entra numa lista própria.

**Produção, cedo** — 239 pontos (67 relações, 172 células de RPC: as 7 `rel_*` × 21 recortes e 25 pessoas em
`rel_saldo_colaborador`), **86.937 linhas reais**, **0 erro, lidas = count em todos**, 15 relações com a ordem provada pela
chave primária, 2 recibos provados pelo SQL e não chamados, **2 reprovados — os mesmos 2 do ensaio**:
- `movimentacoes.sugestao-colaborador` (2.093 recusas, `[].colaborador` `invalid_type`) e `movimentacoes.sugestao-setor`
  (3.247, `[].setor`): a forma declara a coluna NÃO-nula porque o call-site sempre filtra `.not(coluna, 'is', null)` — o
  supabase-js estreita o tipo com esse filtro e a amarração exige a forma não-nula —, e o conferidor lia a relação inteira sem
  o filtro. Não é forma errada; é pré-condição que só o call-site conhecia. Conserto (`0312ea1`): o descritor declara a
  pré-condição (`naoNulas: ['colaborador']`/`['setor']`), o conferidor a aplica no count e nas páginas, e
  `formas/catalogo.test.ts` confere nos dois sentidos que ela bate com o `.not(coluna, 'is', null)` literal do call-site
  (`E-sabotagem-precondicao-nao-nulas.txt`).
- **Sem linha em produção** (count exato 0 — forma exercitada só pelos testes): `admin.senhas-acesso`, `kits.ativos`,
  `kits.admin`.
- **Nenhuma forma dos lotes 1 e 2 recusou linha real de produção.**

**Ensaio, r3** (`0312ea1` — lotes 1 a 3 + a pré-condição `naoNulas`) — 233 pontos, 84.582 linhas, **0 recusa, 0 erro**. As
duas sugestões pararam de recusar (o filtro do descritor vale no count e nas páginas). Um reprovado honesto: `rel_saldo_colaborador`
sem célula no ensaio (não há pessoa cadastrada) — agora aparece como NÃO PROVADO em vez de sumir. 11 descritores sem linha no ensaio.

**Produção, cedo 2** (`465728e` — os quatro lotes) — **259 pontos (86 relações, 173 células de RPC), 93.391 linhas reais, 0
recusa, 0 erro, 0 reprovado, lidas = count em todos**; 19 relações com a ordem provada pela chave primária; 14 recibos provados
pelo SQL e não chamados. Destaques: **`gerados.lista` e `gerados.detalhe` leram os 13 relatórios gerados de produção e a forma do
snapshot aceitou todos** (a pergunta da revisão adversarial sobre formas históricas); `conflitos.lados` 138/138; as sugestões,
já com o filtro do call-site, 1.461 e 307; `papel_atual` com a célula; `rel_saldo_colaborador` em 25 pessoas. Sem linha em
produção (count exato 0): `admin.senhas-acesso`, `kits.ativos`, `kits.admin`.

## 7.2 As rodadas que valem (SHA congelado)

As duas rodadas rodaram na worktree temporária travada em **`66b1571`** (`git checkout --detach`, árvore limpa conferida antes),
com o `.env.local` do repositório entrando por `--env-file` — nunca copiado. Só leitura; a identidade do alvo é conferida pelo
ref do projeto antes do primeiro `select`. Evidência: `E-conferidor-{ensaio,producao}-congelado.{json,txt}`.

**Ensaio (`66b1571`)** — **240 pontos · 89.460 linhas · 0 recusa · 0 erro de leitura · lidas = `count` em todos**, e **1
reprovado**: `itens.saldo-colaborador` não gerou célula nenhuma (NÃO PROVADO). Não é forma errada — é o ensaio: ele não tem
colaborador cadastrado, então a matriz de `rel_saldo_colaborador` não tem sobre quem perguntar. É a mesma lacuna que o censo
mediu (§4) e o motivo de a prova que vale ser a de produção. Outros **12 descritores sem linha no ensaio** (forma não exercitada
ali): `conflitos.lados`, `admin.senhas-acesso`, `ativos.anotacoes`, `colaboradores.por-nome-chave`,
`colaboradores.sugestao-cadastro`, `dev-destrutivo.backup-anotacoes`, `eventos-admin.listar`, `import-logs.backup-anotacoes`,
`itens.saldo-colaborador`, `kits.ativos`, `kits.admin`, `conflitos.backup-anotacoes`.

**Produção (`66b1571`) — a rodada que vale como gate: 264 pontos (91 relações + 173 células de RPC) · 98.704 linhas reais ·
0 recusa · 0 erro de leitura · 0 ponto com `lidas ≠ count` · 0 reprovado.** Rodou em 53 segundos. Além disso: **19 relações com a
ordem de paginação provada pela chave primária** no banco (a coluna de ordem fica fora do `select`), e **14 recibos de RPC que
escreve provados pelo corpo vivo e NÃO chamados** — `dev.checagens-integridade`, `dev-destrutivo.previa-reset`,
`conflitos.apagar`, os três `dev-destrutivo.apagar-*`, os dois `resetar-*`, os dois `forcar-*`, `devolucao-fornecedor.retorno`,
`itens.lancar-itens-lote`, `movimentacoes.criar-com-itens` e `pendencias.resolver-com-lancamentos`. Nenhuma forma do catálogo recusou uma linha de produção. Três descritores sem linha
lá (`count` exato 0, forma exercitada só pelos testes): `admin.senhas-acesso`, `kits.ativos`, `kits.admin` — os mesmos das
rodadas cedo. O `itens.saldo-colaborador` que fica NÃO PROVADO no ensaio é provado aqui, sobre uma amostra de pessoas, sem
imprimir quem.

# 8. A medição — benchmark de lote e A/B de TTFB

## 8.1 Produção ANTES do merge (`medir.mjs`, v1.62.0 no ar, 15/09/2026)

`docs/perf/f58-producao-antes.json` — 2 passadas de aquecimento, 11 rodadas round-robin, sessão do smoke; TTFB mediana em ms,
todas as rotas HTTP 200:

| Rota | TTFB mediana | p95 |
|---|---:|---:|
| `/vercel.svg` (controle estático) | 14,7 | 36,8 |
| `/login` | 32,7 | 100,9 |
| `/relatorios/acesso` | 55,7 | 72,1 |
| `/login` (com sessão) | 65,8 | 80,0 |
| `/` (dashboard) | 366,2 | 423,4 |
| `/ativos` | 303,9 | 344,1 |
| `/ativos/[id]` | 354,0 | 468,5 |
| `/movimentacoes` | 311,9 | 347,3 |
| `/movimentacoes/nova` | 289,1 | 351,5 |
| `/itens` | 359,2 | 470,7 |
| `/pendencias` | 351,0 | 406,3 |
| `/ajuda` | 318,2 | 365,3 |
| `/relatorios/geral` | 497,9 | 728,6 |
| `/relatorios/[filial]` | 388,1 | 577,5 |
| `/relatorios/gerados` | 335,4 | 376,8 |
| `/relatorios/gerados/[id]` | 332,2 | 428,4 |

## 8.2 Benchmark de parse no SHA congelado

`scripts/perf/bench-formas.mts` — sem banco, linhas FICTÍCIAS no volume do censo de produção (ativos 1.620, movimentações 3.553)
e em 10×, mediana de 21 rodadas após 5 de aquecimento, Zod 4.5.4. Antes do lote 2 (`db1c438`, `docs/perf/f58-bench-formas-antes-lote-2.json`)
× no SHA congelado (`docs/perf/f58-bench-formas-congelado.json`), em ms:

| leitura | linhas | estrita antes | estrita congelado | frouxa antes | frouxa congelado |
|---|---:|---:|---:|---:|---:|
| export de ativos (colunas explícitas + embed) | 1.620 | 1,97 | **1,89** | 1,49 | **1,37** |
| export de ativos | 16.200 | 15,33 | **14,27** | 14,97 | **14,61** |
| histórico de movimentações (embeds + jsonb) | 3.553 | 2,47 | **2,56** | 2,63 | **2,21** |
| histórico de movimentações | 35.530 | 23,43 | **23,24** | 23,08 | **23,23** |
| backup `select('*')` de ativos (frouxa, 3 colunas declaradas) | 1.620 | — | — | 4,86 | **4,74** |
| backup `select('*')` de ativos | 16.200 | — | — | 49,94 | **52,68** |

**Leitura.** Nada mudou de patamar. O congelamento foi medido duas vezes (em `932665a` e, depois da correção de palavra, em
`66b1571`), e as duas leituras dão a faixa de ruído da própria mesa: 1,72–1,89 ms no export de 1.620 linhas, 13,13–14,27 ms em
16.200, 49,65–52,68 ms no maior backup — a mesma semente de linhas fictícias, o mesmo volume, execuções diferentes. A
**decisão 5 continua de pé** pelos mesmos números: estrito e frouxo custam o MESMO nas leituras de colunas explícitas (1,89 ×
1,37 ms em 1.620 linhas; 14,27 × 14,61 ms em 16.200 — a ordem entre eles inverte de execução para execução, que é o que
"empate" quer dizer), e a frouxa com poucas colunas declaradas segue mais cara por linha (4,74 ms em 1.620 linhas de
`select('*')`), porque copia o que não declara. O parse do maior backup de hoje custa ~5 ms contra centenas de ms de rede e de
upload — o modo nunca foi questão de custo, e sim de preservar coluna desconhecida.

## 8.3 A/B de TTFB contra o ensaio, no SHA congelado

**Método (o da F33, intercalado).** Dois `next start` do mesmo projeto contra o MESMO banco — o ENSAIO —, diferindo só no commit:
**A** = a `main` `86bd77d`, construída numa worktree temporária fora do repositório (`node_modules` por hard link, variáveis
injetadas pelo lançador, o `.env.local` nunca copiado), na porta 3101; **B** = a branch no SHA congelado, na porta 3100.
`scripts/perf/ab-local.mjs` roda `medir-local.mjs` (que recusa alvo que não seja o ensaio e força `PERF_URL_APP` para o
`localhost` de cada lado) uma vez por lado a cada rodada, e **quem vai primeiro alterna** de rodada em rodada. Persona fictícia
do seed. Por rota e por lado, a mediana das medianas de TTFB; razão bruta = B/A; **normalizada = (B/A) ÷ (B/A do controle)**.
Controles: `/ajuda` (rota do app que a fase não toca — o gate) e `/vercel.svg` (estático, fora do proxy — ao lado).
**Três execuções, e por que houve três.** A primeira (8 rodadas) rodou com a mesa OCUPADA — eu rodava scripts de diagnóstico ao
lado — e acusou 3 rotas acima de +10%; o próprio controle estático subiu 6,7%, o que já diz que a medição não valia. A segunda
(8 rodadas, mesa parada) derrubou justamente aquelas três (`/movimentacoes` 1,005, `/pendencias` 1,024, `/relatorios/gerados/[id]`
0,962 na razão BRUTA) e acusou OUTRAS seis — desta vez porque o controle `/ajuda` caiu 4,7% e o `/vercel.svg` caiu 32,5%: dois
controles que discordam desse tamanho são ruído de mesa, não regressão, e normalizar por um controle que desceu empurra toda
rota para cima. Entre as duas execuções o conjunto de rotas acusadas mudou por inteiro, o que confirma o diagnóstico. A terceira
dobrou a amostra (16 rodadas × 3 repetições por lado, alternando quem começa) com a mesa parada — 48 amostras por rota e por
lado —, e é ela que vale: **o controle `/ajuda` ficou em 1,005**, e nenhuma rota passou de +10%. É a mesma lição da ata da F33
escrita de outro jeito: a leitura só vale quando o controle fica parado, e amostra pequena em mesa ocupada mede a mesa.

| Rota | A (ms) | B (ms) | B/A bruta | normalizada por `/ajuda` | normalizada por `/vercel.svg` |
|---|---:|---:|---:|---:|---:|
| `/vercel.svg` (controle estático) | 10,7 | 9,4 | 0,878 | 0,873 | 1 |
| `/login` (público) | 4,9 | 5,2 | 1,061 | 1,056 | 1,209 |
| `/relatorios/acesso` (público) | 15,0 | 16,2 | 1,080 | **1,074** | 1,230 |
| `/login` com sessão (sonda do `getUser` do proxy) | 43,2 | 43,2 | 1,000 | 0,995 | 1,139 |
| `/` (dashboard) | 261,6 | 262,7 | 1,004 | 0,999 | 1,144 |
| `/ativos` | 224,3 | 234,8 | 1,047 | 1,041 | 1,192 |
| `/ativos/[id]` | 242,1 | 258,7 | 1,069 | **1,063** | 1,217 |
| `/movimentacoes` | 212,1 | 212,8 | 1,004 | 0,998 | 1,143 |
| `/movimentacoes/nova` | 216,7 | 217,9 | 1,006 | 1,000 | 1,145 |
| `/itens` | 464,2 | 460,6 | 0,992 | 0,987 | 1,130 |
| `/pendencias` | 263,9 | 260,3 | 0,987 | 0,981 | 1,124 |
| `/ajuda` (controle do app) | 232,2 | 233,4 | 1,005 | 1 | 1,145 |
| `/relatorios/geral` | 501,1 | 498,6 | 0,995 | 0,990 | 1,133 |
| `/relatorios/[filial]` | 242,3 | 237,1 | 0,979 | 0,973 | 1,115 |
| `/relatorios/gerados` | 241,0 | 240,7 | 0,999 | 0,993 | 1,137 |
| `/relatorios/gerados/[id]` | 236,5 | 236,9 | 1,002 | 0,996 | 1,141 |

**Gate: PASSOU — nenhuma rota acima de +10% na leitura normalizada por `/ajuda`; 0 falha de requisição em 16 rotas.** As duas
maiores leituras são `/relatorios/acesso` (1,074 — 15,0 → 16,2 ms, um milissegundo numa página pública sem leitura de acervo,
ruído puro) e `/ativos/[id]` (1,063 — 242 → 259 ms, ~17 ms na ficha, que é a tela com mais leituras migradas por render: linha
do tempo, termos, itens que foram junto e anotações). As demais ficam em ±2% do 1,000, e sete são NEGATIVAS. O custo do parse
medido sem banco (§8.2) explica a ordem de grandeza: alguns milissegundos por página, contra 210–500 ms de TTFB.
**A coluna normalizada por `/vercel.svg` fica ao lado, e não vale como gate:** o estático mede rede e agendamento do sistema, e
oscilou −12% nesta execução e −32% na anterior — é o motivo de o método da F33 usar uma rota do APP como controle.

## 8.4 Produção DEPOIS do deploy

*A medir depois que a Vercel publicar a `1.63.0`, com o mesmo método do §8.1 — entra no PR de documentação que fecha a fase,
ao lado do antes × depois por rota.*

# 9. A conferência pós-deploy

*Entra no PR de documentação, e é a ÚNICA coisa que roda entre o merge e ele:* `/api/saude` respondendo `1.63.0` com o commit
do merge; `node scripts/smoke/smoke-prod.mjs` com 0 falha; e o `medir.mjs` de produção, comparado com o §8.1. Tudo só leitura.

# 10. Os 33 critérios, autoverificados

| # | Critério | Estado | Evidência |
|---|---|---|---|
| 1 | `lint`, `test`, `build`, `tsc` limpos | ✅ no SHA congelado `66b1571` | `npm run lint` exit 0; `npx vitest run` 216 arquivos · 5.856; `npx tsc --noEmit` exit 0; `npm run build` exit 0 (§14, colado inteiro, e `G-build-congelado.txt`) |
| 2 | a porta devolve o builder: `Promise.all` e `.order().range()` compilam sem cast | ✅ | `relatorios/itens.ts`, `queries/itens.ts`, `relatorios/estoque.ts` sem cast; prova (19) de `linhas-tipos.test.ts` |
| 3 | zero RPC fora da porta; trava por arquitetura nas três grafias, `scripts/**` com isenção nominal | ✅ 38 → 0 | `rpc-unica-porta.test.ts`; sabotagem A (A1–A4) |
| 4 | `filialParaRpc` e `rpc-filial.ts` não existem; nenhum `as unknown as` em argumento de RPC | ✅ | o arquivo foi apagado; o nome só sobrevive no comentário histórico de `rpc.ts:14` |
| 5 | mapa de anuláveis nominal, cada entrada conferida contra o corpo vivo | ✅ 11 entradas | `ARGUMENTOS_ANULAVEIS` + `rpc-mapas-sql.test.ts`; sabotagem B |
| 6 | zero `as unknown as Json` | ✅ 15 → 0 | as duas ocorrências restantes em `src/` são comentário (`json.ts:10`, `pendencias.ts:150`) |
| 7 | `linhasDe`/`linhaDe` em `linhas.ts`; coluna ausente do `select` e o `empresa_id` da virada não compilam, por `@ts-expect-error` | ✅ | `linhas-tipos.test.ts`; sabotagem C1 (11 erros do `tsc` sem as diretivas) |
| 8 | zero cast de leitura fora do resíduo; trava por forma com `{ data: x }` e `(data ?? {})` | ✅ 100 → 0, resíduo vazio | `sem-cast-de-leitura.test.ts` (casos de guarda); sabotagens C2, C3 e C′ |
| 9 | forma errada LANÇA com `registrarFalha`, sem valor, caminho normalizado; nenhum `catch` novo; degradações mantidas | ✅ | `linhas-sem-valor.test.ts` (sabotagem F); `erro-engolido.test.ts` verde; os 14 recibos degradam (decisão 6) |
| 10 | `select('*')` de backup/export frouxos; coluna desconhecida chega ao resultado | ✅ 16 de 16 | `backup-frouxo.test.ts`; sabotagem D |
| 11 | nenhum `select('*')` com `z.object` padrão; modo de lote do benchmark; snapshot frouxo e último lote | ✅ | `exigirModo` recusa em execução; catálogo: 16 `select('*')`, todas frouxas; benchmark antes do lote 2; lote 4 = `gerados.ts` |
| 12 | mentiras de retorno corrigidas na porta, com teste contra o SQL; `lerPapel` distingue "sem papel" de "falhou" | ✅ | `COLUNAS_DE_RETORNO_ANULAVEIS`/`ESCALARES_ANULAVEIS` + `rpc-mapas-sql.test.ts`; sabotagem E; `lerPapel` (`auth/acesso.ts:112`) devolve `{ ok: false }` para erro de banco E para forma errada, e `{ ok: true, papel: null }` para "sem cargo" — conferido por leitura e pela prova (17) de tipo; **não há teste de execução** de `lerPapel` (módulo `server-only`) |
| 13 | `select` concatenados viraram literais e voltaram a ser inferidos | ✅ | os `select` moram literais em `queries/formas/*`; `linhas-tipos.test.ts` recusa select não literal |
| 14 | listas nomeadas; nenhum `includes('literal')` sobre erro fora delas; `admin.ts`, `itens.ts`, `versao-snapshot.ts` consomem | ✅ 155 → 0; 18 nomes | `erros-do-banco.ts`; `casamento-por-texto.test.ts`; sabotagem G2 |
| 15 | teste do `erros.ts` contra corpo vivo e réplica, sem caixa, reprovando texto só histórico | ✅ | `erros-do-banco-sql.test.ts`; sabotagens G1 e G3 |
| 16 | traduções mortas listadas com decisão | ✅ 5 | `D-traducoes-mortas.txt`; ata "As frases de erro do banco"; §13 |
| 17 | lição do enum no `RUNBOOK-BANCO.md`; nenhum enum convertido | ✅ | `88ae77e`; nenhuma migration na branch |
| 18 | conferidor importa schemas e `select` do app, identidade antes de ler, só chamáveis, matriz por número de ordem | ✅ | `scripts/formas/conferir.mts` importa `CATALOGO`; saídas com "filial #n · data n" |
| 19 | censo em ensaio e produção; conferidor nos dois sobre o SHA congelado com 0 recusa, 0 erro, lidas = count | ✅ | censo em `censo-{ensaio,producao}.json`; conferidor sobre `66b1571`: **produção 264 pontos · 98.704 linhas · 0 recusa · 0 erro · 0 ponto com lidas ≠ count**, incluindo os 13 snapshots e a grade das `rel_*`; ensaio 240 pontos · 89.460 linhas · 0 recusa, com `itens.saldo-colaborador` NÃO PROVADO lá (sem pessoa cadastrada) e provado em produção — §7.2 |
| 20 | nenhuma RPC que escreve chamada; retorno provado pelo corpo vivo | ✅ | chamáveis tirados do corpo vivo (`stable`/`immutable`, sem escrita); 14 recibos "provados pelo SQL, não chamados"; `rpc-retorno-sql.test.ts` |
| 21 | benchmark de lote antes do lote 2 e sobre o SHA congelado, volume de produção, linhas fictícias | ✅ | `docs/perf/f58-bench-formas-antes-lote-2.json` (`db1c438`) e `docs/perf/f58-bench-formas-congelado.json` (`66b1571`), ambos sem banco, no volume do censo e em 10×, com linhas fictícias; §8.2 |
| 22 | A/B de TTFB contra o ensaio no SHA congelado, nenhuma rota acima de 10% normalizada | ✅ na 3ª execução | `docs/perf/f58-ab-ttfb.json`: 16 rodadas × 3 repetições, intercalado, `PERF_URL_APP` apontando para cada `next start`; **0 rota acima de +10%** normalizada por `/ajuda`, com o controle em 1,005. As duas execuções anteriores (8 rodadas) foram descartadas com o motivo escrito: mesa ocupada e controle instável — §8.3 |
| 23 | pós-deploy: `/api/saude` 1.63.0 + commit, smoke-prod 0 falha, `medir.mjs` antes × depois | ⏳ roda entre o merge e o PR de documentação | §9 |
| 24 | nenhuma migration; lock e `database.ts` intactos | ✅ | `git diff --name-only main..HEAD -- supabase/migrations supabase/migrations.lock.json src/lib/types/database.ts` → 0 arquivos |
| 25 | nenhuma tela, texto de operador ou assinatura de RPC mudou; nenhum cargo vê menos | ✅ | 0 arquivo em `src/components/`; os 2 de `src/app/` só trocam cast por `linhasDe` (nenhuma linha de texto no diff); sem migration; tradução de erro equivalente em 8.085 casos |
| 26 | `verificar:actions` verde; `db:test:mutations` e `db:types:diff` com os números da F57 no CI | ✅ na mesa · ⏳ CI no PR | `[gate] chunks com Server Actions varridos: 23 · VERDE`; a fase não toca SQL, então os dois números do banco têm de sair iguais aos da F57 |
| 27 | 1.63.0 no `package.json`, `CHANGELOG.md` e `registry.ts`; tag no merge do PR de documentação | ✅ versão em `bb79e67` · ⏳ tag | a tag anotada `v1.63.0` vai no merge do PR de documentação |
| 28 | ata datada em `docs/DECISOES.md` | ✅ | quatro atas de 15/09/2026: as nove decisões, a revisão do lote 2, as frases de erro do banco e o que as revisões adversariais mudaram |
| 29 | `docs/RELATORIO-F58.md` no padrão, roteiro no topo | ✅ | este arquivo |
| 30 | PRs de código e de documentação mergeados com os checks verdes | ⏳ | o de código sobe com os gates fechados (§7.2 e §8.3); o de documentação fecha a fase |
| 31 | `ARQUITETURA.md` §10 e `README.md` citam a porta, `linhas.ts`, as listas de erro e o conferidor | ✅ | `1348518`: as linhas novas citam `chamarRpc`, `linhas.ts`/`linhasDe`, `erros-do-banco`, `conferir.mts` |
| 32 | nenhum dado real em teste, fixture, evidência, log ou saída | ✅ na 3ª passada | `E-varredura-evidencias.json`: **38 arquivos, 0 com ocorrência**, 9 termos de filial comparados (nome e slug de produção, em memória, nunca gravados). As duas passadas anteriores acusaram — homônimo na prosa do resumo e um caminho absoluto cujo diretório de sessão é um UUID —, e as duas causas foram corrigidas (§2.2, itens 15 e 16), não silenciadas |
| 33 | estado de repouso declarado | ✅ | §11 |

# 11. O estado de repouso — se o projeto parar aqui por dois meses

**Nada fica ligado, agendado ou pela metade.** A fase não criou cron, dado, sessão, migration nem worktree que sobreviva ao
fechamento; o conferidor e o A/B são ferramentas de mesa.

**O que continua protegido sozinho, a cada `npm run test` (e no `verificar` do CI):**
- uma chamada de RPC nova fora de `chamarRpc`, em qualquer das três grafias, derruba `rpc-unica-porta.test.ts`;
- uma migration que reescreva o corpo de uma função do mapa e tire a evidência derruba `rpc-mapas-sql.test.ts`; uma que
  tire chave do objeto devolvido por uma RPC que escreve derruba `rpc-retorno-sql.test.ts`; uma que mude a definição de uma
  view estreitada derruba `colunas-de-view-sql.test.ts`;
- uma migration que reescreva uma frase de `raise` traduzida, ou renomeie uma constraint da lista, derruba
  `erros-do-banco-sql.test.ts` nomeando a frase — a tradução não morre calada;
- um cast de leitura novo (inclusive atrás de alias), um `z.custom()` sem predicado, um casamento de erro por texto solto e um
  `select('*')` com forma que remove coluna derrubam as travas próprias; uma coluna ausente do `select` não compila.

**O que envelhece:**
- **o conferidor não roda sozinho.** Ele provou a forma do dado de 15/09/2026. Uma linha nova de forma diferente LANÇA
  (decisão i): a tela daquela leitura mostra erro e o log diz o rótulo e o caminho do campo. Antes de mexer numa forma, rode-o
  (`NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local scripts/formas/conferir.mts --alvo=producao
  --saida=<arquivo>`; só leitura);
- **o snapshot semanal**: `FORMA_SNAPSHOT` é `z.union([V2, V1])` — a V2 exige `meta.schema: 2`, a V1 exige a chave ausente —,
  e a prova de compilação (`relatorios-gerados-tipos.test.ts`) vai num sentido só: a saída da forma cabe em `AnySnapshot`.
  Chave nova numa V2 passa (todo nível é frouxo). Mas **quem criar uma versão com `meta.schema: 3` compila sem aviso e passa a
  gravar relatórios que a tela de gerados recusa**, até a versão entrar na união. Vai nomeado para o backlog (§13);
- **`.returns<>()` é obsoleto no postgrest-js**: a atualização da lib que o remover quebra a compilação de `rpc.ts` — uma linha,
  e o motivo está no cabeçalho;
- **o ensaio envelhece em dado**: a senha do seed só vale para `seed.consulta`, e o ensaio não tem colaborador cadastrado (a
  matriz de `rel_saldo_colaborador` só é provada em produção).

**O que a próxima fase precisa lembrar:** a F60 troca UMA linha do mapa (`RECORTE_DO_RELATORIO`) e as sete `rel_*` mudam juntas;
a F63 põe `empresa_id` no `select` só onde for usar (§13); a F65 renomeia um índice que está na lista de erros, e o teste acusa.

# 12. O que este relatório NÃO prova

- Que a forma do dado de produção de AMANHÃ bate: o conferidor provou a de HOJE; uma linha nova de forma diferente ainda lança.
- Que o retorno das RPCs que ESCREVEM está certo em execução: foi provado pelo SQL vivo (chaves e colunas), não chamando.
- Que o A/B de TTFB vale para o volume de produção: rodou no volume do ensaio.
- Que a amarração pega semântica errada: ela pega coluna AUSENTE do `select` e tipo trocado, não coluna presente com significado errado.
- Que a tradução de uma frase MONTADA em execução (`'Saldo ' || x`) está certa: o teste confere o pedaço literal, não a frase
  inteira. E o "corpo vivo" é o das MIGRATIONS: objeto alterado à mão num banco, fora da cadeia, fica invisível para as travas
  SQL desta fase (quem cobre isso é a trava de migrations da F46 e o gate de deriva da F47).
- Que a trava de cast enxerga o que só o verificador de tipos resolve — `typeof`, `z.infer<…>`, tipo condicional, tipo de
  pacote — como argumento de `paginarTodos`/`paginarPorIds`. Está declarado no próprio teste; nenhum aparece hoje.
- Que as leituras sem linha em produção aceitam dado real: com `count` exato 0, a forma delas foi exercitada só pelos testes
  (a lista está em §7.2).

# 13. Pendências e backlog nomeado

- **F60** — a linha do mapa em que `p_filial` vira `p_filiais` (`RECORTE_DO_RELATORIO` em `rpc.ts`), e `getSaldosItens(filialId | null)`.
- **F63** — o catálogo tem **91 leituras de relação em 23 origens**: **74 estritas de colunas explícitas**, 1 frouxa de colunas
  explícitas e **16 `select('*')` frouxas**. Quando a coluna `empresa_id` nascer, **nenhuma das 74 quebra**: o `select` explícito
  não a traz, e a forma estrita só recusa coluna que o `select` traz e ela não declara. Ela precisa ENTRAR no `select` (e na
  forma) exatamente nas leituras em que a F63 for usar a empresa — e aí a amarração obriga a declarar as duas coisas juntas; é
  a prova `empresa_id` de `linhas-tipos.test.ts`. As **16 `select('*')` já a carregarão** sem mudança: `z.looseObject` preserva
  coluna não declarada, e `backup-frouxo.test.ts` prova isso com uma coluna desconhecida.
- **F65** — `relatorios_gerados_periodo_filial_versao_uidx` em `CONSTRAINTS_TRADUZIDAS`: recriar o índice com outro nome quebra
  `ehViolacaoDeVersao` — agora com teste que acusa.
- **Traduções mortas** — as 5 grafias que saíram (`docs/f58-evidencias/D-traducoes-mortas.txt`): "saldo insuficiente",
  "liberação maior" e "reserva aberta" (só em corpos históricos das `0015`/`0019`/`0024`), "saldo negativo" e "liberacao maior"
  (nunca estiveram em SQL fora de comentário). Decisão: **saíram**; cada ramo manteve grafia viva, e a equivalência de 8.085
  casos mostra que nenhum `raise` vivo mudou de tradução.
- **A prova do snapshot no sentido inverso** — hoje só se prova que a saída de `FORMA_SNAPSHOT` cabe em `AnySnapshot`. Falta a
  guarda que reprove um `AnySnapshot` que a forma não aceita (a versão `meta.schema: 3` do §11). Não entrou: é mudança no
  escritor do snapshot, fora do escopo de leitura desta fase.
- **Os dois `DbClient`** — o mesmo `SupabaseClient<Database>` exportado duas vezes, por `src/lib/auth/acesso.ts:14` e por
  `src/lib/queries/relatorios/comum.ts:11` (e redeclarado, sem export, em `queries/vocabulario-import.ts:32` e
  `queries/import-logs.ts:28`). Não unificados — fora do escopo; a F58 não precisou deles para tipar a porta.
- **O alvo de `validar-truncamento.ts`** — o cabeçalho diz "valida contra PRODUÇÃO", mas o script lê
  `NEXT_PUBLIC_SUPABASE_URL` com a service role, e desde a inversão da F55 esse nome aponta para o ENSAIO. A F58 só o
  passou pela porta de RPC (`chamarRpc`); o alvo não foi consertado — fora do escopo, e trocar o alvo de um script que usa
  service role pede decisão própria.

# 14. A contagem final e o build

Pela mesma varredura das travas, antes (`main` `86bd77d`) × depois (SHA congelado `66b1571`):

| | Antes | Depois | Quem conta |
|---|---:|---:|---|
| chamadas de RPC fora da porta (`src/**`, fora de teste) | 38 | 0 | `rpc-unica-porta.test.ts` |
| casts de leitura | 100 | 0 | `sem-cast-de-leitura.test.ts` (`CONGELADOS`) |
| casamentos de erro por texto solto | 155 | 0 | `casamento-por-texto.test.ts` |
| `npm run test` | 201 arquivos · 5.104 testes | 216 arquivos · 5.856 testes | vitest |

`npm run build` no SHA congelado, colado por inteiro:

```
> estoque-ti-wap@1.63.0 build
> next build

▲ Next.js 16.2.12 (Turbopack)
- Environments: .env.local
- Experiments (use with caution):
  · serverActions

  Creating an optimized production build ...
✓ Compiled successfully in 17.6s
  Running TypeScript ...
  Finished TypeScript in 39.8s ...
  Collecting page data using 7 workers ...
  Generating static pages using 7 workers (0/32) ...
  Generating static pages using 7 workers (8/32)
  Generating static pages using 7 workers (16/32)
  Generating static pages using 7 workers (24/32)
✓ Generating static pages using 7 workers (32/32) in 920ms
  Finalizing page optimization ...

Route (app)
┌ ƒ /
├ ○ /_not-found
├ ƒ /admin/colaboradores
├ ƒ /admin/filiais
├ ƒ /admin/importar
├ ƒ /admin/itens
├ ƒ /admin/kits
├ ƒ /admin/motivos
├ ƒ /admin/senhas
├ ƒ /admin/tipos-item
├ ƒ /admin/usuarios
├ ƒ /ajuda
├ ƒ /ajuda/[slug]
├ ƒ /ajuda/manual
├ ƒ /api/saude
├ ƒ /ativos
├ ƒ /ativos/[id]
├ ƒ /ativos/novo
├ ƒ /auth/confirm
├ ƒ /auth/definir-senha
├ ƒ /dev
├ ƒ /dev/destrutivo
├ ƒ /itens
├ ƒ /itens/conferencia
├ ƒ /itens/historico
├ ○ /login
├ ƒ /movimentacoes
├ ƒ /movimentacoes/devolucao-fornecedor
├ ƒ /movimentacoes/nova
├ ƒ /pendencias
├ ƒ /relatorios/[filial]
├ ƒ /relatorios/acesso
├ ƒ /relatorios/gerados
├ ƒ /relatorios/gerados/[id]
└ ƒ /versoes


ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand

build exit 0
```

Nenhuma rota nova, nenhuma rota perdida: as 32 páginas e o proxy são os mesmos da `main` — a fase não mexeu em tela.
A saída completa também está em `docs/f58-evidencias/G-build-congelado.txt`.
