# Plano de área — o item passa a falar a língua do ativo

**Escrito em 31/08/2026**, a partir de quatro dores relatadas pelo Johnny e de uma medição em produção.
Plano de área no sentido do [`README.md`](README.md): é **razão de desenho**, escrito antes de construir.
Quem manda sobre o comportamento de hoje continua sendo a [`ESPECIFICACAO.md`](ESPECIFICACAO.md), as migrations e o código.

> **O que este documento entrega:** o diagnóstico com a causa de cada dor, as quatro decisões já tomadas, o
> desenho novo e **duas ordens de serviço prontas para virar prompt** — F41 (o motor) e F42 (as telas).

---

## 1. As quatro dores, e o que a medição diz de cada uma

As dores são do Johnny, em 31/08/2026. Os números ao lado saíram de `SELECT` só-leitura em **produção**
(`pbtjcalbmepmrqzprusb`) no mesmo dia — nenhum nome, nenhum patrimônio, só contagem.

| # | A dor, como foi dita | O que a medição mostra |
|---|---|---|
| **D1** | "o item não conversa com os ativos; as movimentações e os status dos itens não têm o mesmo nome dos ativos — dois nomes para a mesma função" | O ativo tem 16 tipos de movimentação e 9 estados; o item tem 6 tipos de lançamento e 4 números. **Nenhum par de nomes coincide** — e três colidem ao contrário (ver §2.1) |
| **D2** | o erro do print: *"Nada foi gravado. O 1º item que ia junto foi recusado: O retorno é maior que a quantidade liberada em aberto"* — e, mesmo lançando itens como "atrelado", a devolução por desligamento não fecha | Dos **132** pares item×filial possíveis (22 itens × 6 filiais), só **4** têm saída em aberto — nos outros **128** marcar "Voltou" **derruba o lote inteiro**. E **110** estão sem estoque disponível: neles a entrega ("Itens que vão junto") também é recusada. As **5** reservas abertas ("atrelado") **não têm caminho de fechamento** pela devolução do ativo — por desenho, não por bug pontual |
| **D3** | "a view de itens foge totalmente do padrão do sistema; eu mesmo que projetei estou me perdendo" | `/itens` é a única rota que empilha **três telas numa** (saldos + um toggle que troca as *colunas* + histórico com filtro próprio), com **dois conjuntos de filtro de gramáticas diferentes** na mesma página. Está **fora do casco** do sistema de design da F40 (só as 3 rotas de `/ativos` estão dentro). O diálogo de lançamento tem **876 linhas** |
| **D4** | "a maioria dos itens não foi cadastrada; ter que lançar o item antes para depois movimentar o ativo não é viável — quero cadastro passivo, híbrido, como o de colaboradores" | O diário de itens inteiro tem **58 lançamentos**, todos dos últimos 30 dias; **22 deles são acerto de contagem** (o estoque foi carregado no braço). **Zero** lançamentos com `movimentacao_id` — ou seja, **a entrega/devolução com itens da F38 nunca gravou uma linha em produção**. Enquanto isso: 1.614 ativos e 3.431 movimentações |

A leitura das quatro juntas: **o subsistema de itens está sendo rejeitado pelo próprio uso.** Ele não foi
abandonado por preguiça — ele **bloqueia** quem tenta usá-lo, e cobra um vocabulário que ninguém precisa
aprender para operar o resto do sistema.

---

## 2. O diagnóstico — por que cada dor acontece

### 2.1 D1 · Dois vocabulários para o mesmo mundo, e três colisões ao contrário

Os valores do enum `tipo_lancamento` (migration `0015`, `retorno` na `0027`) são **imutáveis**; os rótulos
foram reconciliados na F6A (16/07/2026) e vivem em `TIPO_LANCAMENTO_META` (`src/lib/dominio.ts`). O resultado:

| Conceito real | Ativo diz | Item diz (rótulo) | Item guarda (enum) |
|---|---|---|---|
| entrou no acervo | **Compra** | Entrada | `entrada` |
| foi para a pessoa | **Saída** | **Liberação** | `saida` |
| voltou da pessoa | **Devolução** | **Retorno** | `retorno` |
| separado, vai voltar | **Reserva** | **Atrelar** | `reserva` |
| voltou do "separado" | *(não existe)* | **Devolução** | `liberacao` |
| correção | **Ajuste** | Ajuste | `ajuste` |
| trocou de filial | **Transferência** | *(par de Ajustes)* | `ajuste` ×2 |

As três armadilhas, e todas já custaram caro:

1. **`saida` significa "Saída" no ativo e "Liberação" no item.** Mesmo valor, dois nomes.
2. **`liberacao` é rotulado "Devolução"** — enquanto "Liberação" é o rótulo de **outro** tipo (`saida`).
   O comentário em `src/lib/actions/erros.ts` já registra que uma mensagem de erro precisou ser reescrita
   por causa disso: o texto antigo falava "reserva e liberação", e "Liberação", na tela, é outra coisa.
3. **"Atrelar" descreve exatamente o que o operador quer** ("este item acompanha o equipamento") **e faz
   outra coisa**: prende a unidade a um número de **chamado**, e só um lançamento `liberacao` **com o mesmo
   chamado** a solta. Foi o que o Johnny fez, e é a segunda metade da D2.

Já houve uma tentativa de tapar isso **sem mexer nos rótulos**: a correção avulsa de 19/08/2026
(`src/lib/itens/escolha-tipo.ts`) trocou o select plano por duas perguntas de operador — o cabeçalho do
arquivo cita, com todas as letras, o feedback *"está confuso o controle de itens"*. Duas semanas depois a
dor voltou. **O caminho até o tipo foi consertado; o vocabulário, não.**

Os **números** repetem o problema: a tela mostra `Total · Estoque · Atrelados · Falta` — e nenhum desses é
palavra do ativo (`Em estoque`, `Em uso`, `Reservado`). Pior: **o número que mais importa não é coluna
nenhuma** — quanto está **com as pessoas** (`Σ saída − Σ devolução`) só aparece por dedução, como a
diferença entre Total e Estoque.

### 2.2 D2 · O erro do print: a guarda certa no lugar errado

O caminho, ponta a ponta:

1. No passo 2 da devolução, marcar **"Voltou"** numa linha do checklist produz, em
   `src/components/movimentacoes/nova/itens-do-lote.ts`, uma linha de item de **quantidade 1**.
2. `src/lib/actions/movimentacoes.ts` (`montarItensJunto`) **deriva o tipo do tipo da movimentação**:
   entrega → `saida`, devolução → `retorno`. O operador não escolhe.
3. A RPC `criar_movimentacao_com_itens` (`0117`) grava tudo numa transação só — **tudo ou nada**, por
   decisão de 28/08/2026 ("meio lote é pior que lote nenhum").
4. O trigger `valida_lancamento_item` (`0027`, recriado na `0118`) recusa o `retorno`:
   `Σsaida − Σretorno` daquele par (item, filial) precisa ser **≥ a quantidade que volta**.
5. A recusa aborta a transação. `traduzErroBanco` traduz, e a action monta a frase do print.

**A guarda está certa** — devolver mais do que saiu é erro de digitação em 99% dos casos. **A premissa é
que está errada:** ela supõe um diário de itens completo desde sempre. O diário nasceu em 17/08/2026, e o
acervo físico é de anos. Em produção, **128 dos 132 pares item×filial não têm saída em aberto**.

A F38 previu *uma* metade desse problema e resolveu bem: `src/lib/itens/vinculo-retorno.ts` decide **não
gravar o vínculo com a pessoa** quando ela não tem saldo daquele item — "repõe o estoque igual, sem inventar
dívida". Mas o teto **global** (`retorno ≤ liberado em aberto`, que ignora pessoa) continuou de pé, e é
ele que derruba o lote. A defesa foi construída contra a guarda de 0118 e ficou faltando a de 0027.

**A segunda metade da D2** — "lancei como atrelado e a devolução por desligamento não fecha" — não é bug,
é o desenho: `reserva` só é fechada por `liberacao` **com o mesmo chamado**, e o checklist da devolução
emite `retorno`, que só conversa com `saida`. Os dois pares **nunca se encontram**. Some-se a isso que o
lançamento avulso nasce com `movimentacao_id` nulo por desenho (`0116`): o item "atrelado" pela tela de
itens **nem aparece** no card "Itens que foram junto" da ficha do ativo. Ele fica invisível dos dois lados.

**O mesmo bloqueio existe em mais dois caminhos**, e ninguém os notou porque o primeiro já barrava antes:
- **Entrega** ("Itens que vão junto"): `saida` exige estoque na filial. **110 dos 132 pares estão sem
  estoque disponível** → o lote inteiro é recusado com "Estoque insuficiente".
- **Pendência de item** → "Item recuperado" grava `retorno` (`resolver_pendencias_item_com_lancamentos`,
  `0119`). Mesma guarda, mesma recusa. Há **14 pendências de item abertas** em produção hoje.

### 2.3 D3 · A tela é a exceção do sistema

- **Fora do casco.** A F40 criou `Pagina`, `CabecalhoDaPagina`, `SecaoDaPagina`, `QuadroDeTabela`,
  `CartaoDeMetrica` e `EstadoVazio` — e o piloto foram as **3 rotas de `/ativos`**. `src/lib/layout/consistencia.test.ts`
  lista as pendentes por frente, e `/itens` está lá, nominalmente.
- **Três telas numa.** `src/app/(app)/itens/page.tsx` (555 linhas) empilha: cabeçalho com 5 controles →
  filtro nº 1 → N blocos-tabela por grupo, em **duas variantes mutuamente exclusivas** → uma segunda seção
  ("Histórico de lançamentos") com **segundo botão de CSV**, **filtro nº 2** e a única paginação da página,
  que pagina o histórico e **não** os saldos.
- **Dois filtros com gramáticas diferentes** na mesma tela: um sem `<Label>`, com um **toggle segmentado
  Consolidado/Por filial**; o outro com `<Label>` visível. E o toggle **reescreve as colunas** — é a única
  tela do sistema em que um filtro muda o formato da tabela, não o recorte.
- **O diálogo de 876 linhas** (`lancar-item-dialog.tsx`) pede, num modal rolável: carrinho multi-linha,
  escolha de tipo em **dois níveis**, filial, data, chamado condicional, colaborador com rótulo que muda
  por tipo e observação. A mesma classe de decisão, no ativo, é um **wizard de 3 passos em rota própria,
  com revisão**.
- **Cinco superfícies de item, uma entrada de menu.** `/itens`, `/itens/conferencia` (só por botão no
  cabeçalho), `/admin/itens`, a seção no wizard, os blocos na ficha e nos relatórios.

Nada disso está catalogado: `BACKLOG-UX.md` e `DIVIDA-TECNICA.md` registram **falta de recurso e dívida de
código** em itens (carrinho sem transação, `useState` demais, `as unknown as`), **nunca a forma da tela**.

### 2.4 D4 · O cadastro exige o que o cadastro deveria produzir

Hoje, para o estoque acompanhar uma devolução, é preciso que **antes** exista: (a) o item no catálogo,
(b) saldo daquele item **naquela filial**, e (c) uma saída em aberto que case com a volta. Três pré-condições
para registrar um fato que **já aconteceu**. É a inversão exata do conceito central do sistema — *"a
movimentação é a fonte da verdade"* (spec §4).

E o cadastro do catálogo é **fechado ao operador**, em três camadas alinhadas:
`criarItemInline` exige `exigirAdmin` (`src/lib/actions/itens.ts`), a policy de INSERT de `itens` exige
`e_admin()` (`0063`), e a tela nem renderiza a opção (`podeCriarItem={admin}`). O comentário do código
justifica: *"é CATÁLOGO, logo exige ADMIN … ele lança sobre o catálogo curado, não o edita"*.

O precedente que derruba essa justificativa é da própria casa, e é de três dias atrás: a **F37/D5** abriu
`colaboradores` ao operador *"porque é ele quem cadastra a pessoa inline no meio da movimentação, e exigir
admin ali quebraria o fluxo na mão dele"* (`CLAUDE.md`, ata em `DECISOES.md`). **É a mesma frase, palavra
por palavra, para itens.**

---

## 3. As decisões (Johnny, 31/08/2026)

| # | Pergunta | Decisão |
|---|---|---|
| **J1** | Até onde levar o vocabulário? | **Um par só, com as palavras do ativo.** Sobram 4 tipos — Compra · Saída · Devolução · Ajuste (+ Transferência). O par Atrelar/Devolução-de-chamado **sai da tela**; o histórico continua legível. Os números viram Total · Em estoque · Em uso |
| **J2** | O que gravar quando o item volta (ou sai) sem estar registrado? | **Regulariza sozinho e avisa.** O sistema grava um acerto de contagem com justificativa automática, amarrado àquela movimentação, e segue. **Nunca bloqueia** o registro do equipamento |
| **J3** | Escopo do redesenho da tela | **Reescrever no padrão de `/ativos`**: filtros + uma tabela + paginação, dentro do casco da F40. Histórico vira rota própria; o modal de 876 linhas encolhe |
| **J4** | Fatiamento | **Duas ordens.** F41 = banco, vocabulário e o fim do bloqueio. F42 = as telas. Cada uma fecha sozinha, com versão e tag |

Estas quatro entram como ata em [`DECISOES.md`](DECISOES.md) na data de hoje.

---

## 4. O desenho novo

### 4.1 Um vocabulário só (J1)

**Os valores do enum não mudam.** `tipo_lancamento` continua sendo `entrada · saida · reserva · liberacao ·
retorno · ajuste`: renomear valor de enum reescreveria a leitura de 58 lançamentos e de todo relatório
congelado. O que muda é **o rótulo** e **o que a tela oferece**.

| Enum (imutável) | Rótulo hoje | **Rótulo novo** | Espelha, no ativo | Oferecido na tela? |
|---|---|---|---|---|
| `entrada` | Entrada | **Compra** | `compra` — "Compra" | sim |
| `saida` | Liberação | **Saída** | `saida` — "Saída" | sim |
| `retorno` | Retorno | **Devolução** | `devolucao` — "Devolução" | sim |
| `ajuste` | Ajuste | **Ajuste** | `ajuste` — "Ajuste" | sim |
| `reserva` | Atrelar | **Reserva** | `reserva` — "Reserva" | **não** — só histórico |
| `liberacao` | Devolução | **Devolução de reserva** | — | **não** — só histórico |
| par de `ajuste` | *(sem nome)* | **Transferência** | `transferencia` | sim (tela própria, como hoje) |

E os números, que são o "status" do item:

| Hoje | **Novo** | Fórmula — **inalterada** |
|---|---|---|
| Total | Total | `Σ entrada + Σ ajuste` |
| Estoque | **Em estoque** | `total − reservado − máx(0, em uso)` |
| *(não é coluna)* | **Em uso** | `Σ saída − Σ devolução` |
| Atrelados | **Reservado** | `Σ por chamado máx(0, reserva − liberação)` — some da tela quando zerar |
| Falta | Falta | `máx(0, reservado + em uso − total)` |

**Nenhuma fórmula do banco muda.** A `valida_lancamento_item`, a `rel_saldo_itens` e as demais `rel_*`
continuam iguais; muda o nome que a tela dá ao número que elas já devolvem. As colunas SQL mantêm os nomes
atuais (`total`, `estoque`, `atrelados`) — renomeá-las custaria caro e não resolve dor nenhuma.

**As 5 reservas abertas ganham saída.** Como `reserva` sai da tela, as 5 que estão de pé em produção
precisam de caminho. Na F41, uma conversão **única e só-INSERT** fecha cada uma (`liberacao`) e a reabre como
`saida` (com a pessoa quando houver nome; o chamado é preservado no campo `chamado` e citado na observação).
**Efeito no estoque: zero** — antes e depois, a unidade continua fora da prateleira. Depois disso,
`reservado` é 0 para sempre, e a devolução do equipamento passa a fechar aquelas unidades como fecha
qualquer outra. Uma décima checagem de integridade em `/dev` ("reserva aberta") garante que não voltem.

### 4.2 O item entra pelo uso (J2 + D4) — o "cadastro passivo", em duas camadas

**Camada 1 — o catálogo nasce no fluxo.** Espelho exato da F37/D5, sem invenção:

- `itens` ganha a coluna **gerada** `nome_chave` (minúsculas, sem acento, espaços colapsados) com índice
  único, por uma função `public.item_chave(text)` `immutable` — a **mesma** normalização de
  `colaborador_chave`, com a mesma guarda TS↔SQL (`src/lib/itens/chave.ts` + `chave-sql.test.ts`).
  Hoje a dedupe é só `lower(nome)`: "Mouse " e "mouse" são dois itens. *(Conferido em produção: os 22 itens
  atuais **não colidem** sob a chave nova — o índice único entra sem conflito.)*
- `itens` ganha `criado_por` (hoje não tem).
- A policy de **INSERT** de `itens` passa de `e_admin()` para **`pode_escrever()`**; UPDATE e DELETE seguem
  `e_admin()`. `criarItemInline` troca `exigirAdmin` por `exigirPapel(…, 'operador')`. Editar, desativar e
  apagar item continuam do nível administrador — igualzinho a colaborador.
- O campo de item no fluxo passa a oferecer **"Cadastrar"** quando o texto não casa com nada, como o
  `campo-colaborador`. **Criado a partir de uma linha do checklist, o item já nasce com o `tipo_id` daquela
  linha** — o que fecha, de graça, o buraco do `MSG_SEM_ITEM_DO_TIPO` ("nenhum item de catálogo deste tipo —
  a devolução foi registrada, mas o estoque não mudou").

**Camada 2 — o saldo nasce no fato.** É o coração da F41, e a regra é uma só:

> **O sistema nunca recusa um lançamento de item por falta de saldo dentro de uma movimentação de ativo.
> Ele parte a quantidade em duas: a parte que o diário já conhecia vira o lançamento normal; a parte que
> ele não conhecia vira um acerto de contagem com justificativa automática, marcado como regularização.**

Concretamente, **dentro da transação e sob a mesma trava** que a RPC já adquire:

| Caminho | Lê | Grava |
|---|---|---|
| **Devolução** de `q` (checklist "Voltou", ou "Item recuperado" na pendência) | `A` = em uso em aberto do par (item, filial) | `ajuste +(q − A)` marcado `regularizacao`, **e depois** `retorno min(q, A)` — quando `A = 0`, é uma linha só |
| **Entrega** de `q` ("Itens que vão junto") | `E` = em estoque do par | `ajuste +(q − E)` marcado `regularizacao` **antes**, e depois a `saida q` normal |
| **Lançamento avulso** pela tela de itens | idem | idem — **a regra é a mesma nos dois caminhos**, senão nascem dois comportamentos |

**Por que isto não mexe em guarda nenhuma.** A conta fecha sozinha, e é essa a beleza do desenho:

```
Devolveu 1 carregador na filial 3, que o sistema nunca viu sair.
  antes:   total 5 · em estoque 5 · em uso 0
  ajuste +1 (regularização) → total 6 · em estoque 6
  (não há retorno a gravar: A = 0)
  depois:  total 6 · em estoque 6 · em uso 0        ✔ a peça entrou no acervo e está na prateleira

Devolveu 2 cabos, e o sistema conhecia 1 saída.
  antes:   total 4 · em estoque 3 · em uso 1
  ajuste +1 (regularização) → total 5 · em estoque 4
  retorno 1                 → em uso 0 · em estoque 5
  depois:  total 5 · em estoque 5 · em uso 0        ✔ dois voltaram para a prateleira, um era desconhecido

Entregou 1 mouse numa filial sem saldo.
  antes:   total 0 · em estoque 0
  ajuste +1 (regularização) → total 1 · em estoque 1
  saida 1                   → em estoque 0 · em uso 1
  depois:  total 1 · em uso 1                        ✔ o mouse existe e está com a pessoa
```

Em nenhum passo o estoque fica negativo, o total fica negativo ou o "em uso" passa do que saiu.
**`valida_lancamento_item` não muda uma linha** — as quatro guardas dela continuam de pé, inclusive a que
gerou o print. A diferença é que a aplicação passa a **escolher entre gravações que o banco já aceita** —
exatamente o que `vinculo-retorno.ts` já faz com o vínculo da pessoa, e pelo mesmo motivo escrito lá:
*"a guarda continua sendo a linha que vale; se a aplicação errar, o banco recusa, e está certo"*.

**Onde a conta é feita: no Postgres, dentro da RPC.** Não na action. Entre ler o saldo no servidor e gravar,
outra sessão pode mexer no mesmo par — e a partição sairia errada, o trigger recusaria e o lote morreria de
novo, pelo mesmo motivo que estamos consertando. A RPC `criar_movimentacao_com_itens` **já** adquire todas
as travas em ordem determinística antes do primeiro INSERT (`0117`); a leitura entra depois delas.
**A observação da regularização chega pronta da aplicação** (função pura em `src/lib/itens/regularizacao.ts`,
testada), porque a RPC desta casa **não redige texto** — regra do cabeçalho da `0117`, e o `CHECK`
`lanc_item_ajuste_obs` exige justificativa em todo ajuste.

**A marca.** `lancamentos_item` ganha `regularizacao boolean not null default false`. Não é `forcado`
(`0079`), que é da Zona destrutiva e só a janela `estoque.dev_destrutivo` grava. A marca serve para: o
histórico dizer *"acerto automático — voltou com o equipamento e não havia saída registrada"*, o relatório
separar o que é compra de verdade do que é regularização, e uma checagem de `/dev` medir quanto do acervo
ainda está sendo descoberto pelo uso.

**Ordem de inserção.** O ajuste positivo entra **antes** — é a mesma regra total que a `0122` já escreveu
("ajuste positivo repõe o Total antes dos demais positivos"), pelo mesmo motivo: a ordem errada faz o
trigger recusar por estoque negativo.

**O estorno já cobra isso de nós.** `estornar_movimentacao_com_itens` (`0121`) confere, antes de devolver,
que **nenhum lançamento da movimentação ficou sem estorno** — e recusa a transação inteira se ficou. Logo,
`planejarEstorno` (`src/lib/itens/estorno.ts`) **tem de planejar o inverso do ajuste de regularização**, ou
o estorno passa a falhar. A ordem já prevista na `0122` acomoda o inverso sem mudança.

### 4.3 O que sai da tela (J1 + J3)

- A **segunda pergunta** do diálogo de lançamento (`escolha-tipo.ts`) **morre**: sem o par reserva/liberação,
  "Saiu da prateleira" e "Voltou à prateleira" têm uma resposta só. Sobram 4 botões — Compra · Saída ·
  Devolução · Ajuste — que são as palavras do ativo.
- O campo **chamado** deixa de ser obrigatório-condicional (ele existia por causa da reserva); continua
  disponível como informação livre.
- A coluna **Reservado** some da tabela assim que zerar (fica no histórico e no filtro).
- O **toggle Consolidado/Por filial** vira o filtro de filial padrão do sistema; a comparação entre filiais
  passa a ser **linha expansível** por item (o mesmo chevron que os relatórios já usam desde a F16), o que
  acaba com o filtro que reescreve colunas.

---

## 5. F41 — o motor: o item para de bloquear e passa a falar a língua do ativo

**Objetivo declarado:** ao fim da F41, marcar "Voltou" no checklist de uma devolução **nunca** derruba o
lote, o operador cadastra item no meio do fluxo, e nenhuma tela oferece dois nomes para a mesma coisa.
**Sem migration destrutiva, sem dependência nova, custo R$ 0.**

### Frente A — banco

| Migration | O que faz |
|---|---|
| **`0125_item_chave_e_regularizacao.sql`** | `public.item_chave(text)` `immutable` (espelho de `colaborador_chave`) · `itens.nome_chave` gerada + índice único · `itens.criado_por` · policy de INSERT de `itens` para `pode_escrever()` · `lancamentos_item.regularizacao boolean not null default false` |
| **`0126_lancamento_regulariza.sql`** | Recria `criar_movimentacao_com_itens` (`0117`) e `resolver_pendencias_item_com_lancamentos` (`0119`/`0122`) com a partição da quantidade · cria `lancar_itens_lote` (o avulso, hoje um `for` de INSERTs sem transação — item da `DIVIDA-TECNICA.md`) |
| **`0127_conversao_reservas.sql`** | Conversão única das reservas abertas (`liberacao` + `saida`, só INSERT) · décima checagem `reserva_aberta` em `dev_checagens_integridade` |

**Armadilha obrigatória** (lição escrita na `0047`, repetida na `0109` e na `0118`): o corpo de partida de
toda função recriada é lido **do banco** por `pg_get_functiondef`, com o `md5` registrado no cabeçalho da
migration — **nunca** de uma migration antiga. `criar_movimentacao_com_itens` passou por `0117` → `0121`;
montar a recriação de qualquer outra fonte perde pedaço em silêncio.

**O que NÃO pode sair da recriação:** as duas classes de trava e a ordem entre elas (ativos primeiro,
advisory depois), a filial derivada do ativo **lido sob a trava**, o bloco `exception` que etiqueta a linha
culpada (`f38_linha` / `f38_item`) e o `security invoker` declarado. `supabase/tests/f38_itens_com_ativo.sql`
trava isso — e ganha cenários novos.

### Frente B — as funções puras (`src/lib/itens/`)

- `chave.ts` + `chave-sql.test.ts` — a normalização do nome do item, espelho provado do SQL.
- `regularizacao.ts` — a partição da quantidade (a mesma conta da RPC, para a tela **prever** o que vai
  acontecer e dizer antes de gravar) e os textos prontos da observação. Função pura, testada caso a caso.
- `estorno.ts` — `planejarEstorno` passa a planejar o inverso do ajuste de regularização.
- `escolha-tipo.ts` — 4 grupos sem segunda pergunta.
- `dominio.ts` — `TIPO_LANCAMENTO_META` com os rótulos novos; a pílula de cada tipo passa a usar **a mesma
  tinta** do tipo correspondente do ativo (já são os mesmos tokens de selo desde a F40).

### Frente C — actions e fluxo

- `movimentacoes.ts` (`montarItensJunto`) entrega ao RPC a linha crua + a observação de regularização
  pronta; a decisão de partir a quantidade é do banco.
- `itens.ts`: `criarItemInline` para operador; `lancarItens` passa a chamar a RPC transacional.
- `pendencias.ts`: "Item recuperado" pelo mesmo caminho.
- O painel de sucesso e o toast dizem, em uma linha, **o que foi regularizado** ("2 acessórios entraram no
  estoque por acerto automático") — a mesma discrição com que a F38 avisa sobre o vínculo da pessoa.

### Frente D — texto e documentação

- **Ajuda** (`src/lib/ajuda/conteudo/`): `itens-por-quantidade.ts`, `lancar-itens.ts` e
  `mensagens-de-erro.ts` reescritos. ⚠ `referencia.test.ts` **compara as frases da ajuda com
  `src/lib/actions/erros.ts`** — mudar uma sem a outra derruba o build.
- **Spec**: §5 (`lancamentos_item`, `itens`), §6 (emenda de vocabulário), §8 (regras 11/12/13) e o glossário.
- **`MATRIZ-REGRAS.md`**, **`ARQUITETURA.md` §10**, **`DECISOES.md`** (as atas), **`CHANGELOG.md`**.
- **Versão `1.46.0`** — é fase, logo MINOR: bump no `package.json`, entrada no topo de
  `src/lib/versoes/registry.ts` em linguagem de operador, tag anotada `v1.46.0` publicada (regra 8 do
  `CLAUDE.md`; `cobertura-changelog.test.ts` derruba o `npm run test` se faltar).

### Checklist de aceite da F41 (autoverificado)

1. [ ] **O caso do print:** devolução com "Voltou" num item **sem saída em aberto** grava a movimentação **e**
       o acerto; o lote **não** é recusado; a ficha do ativo mostra o item em "Itens que foram junto".
2. [ ] Devolução de 2 unidades com 1 saída em aberto grava `retorno 1` + `ajuste +1`, e os três números
       fecham (`total +1`, `em estoque +2`, `em uso 0`).
3. [ ] Entrega ("Itens que vão junto") de item **sem saldo na filial** grava a saída e regulariza.
4. [ ] "Item recuperado" numa das 14 pendências abertas funciona sem saldo prévio.
5. [ ] **Estorno** de uma movimentação que regularizou desfaz as duas linhas; a conferência interna da
       `0121` ("nenhum lançamento ficou sem estorno") passa.
6. [ ] As **5 reservas abertas** viraram saída: `reservado = 0` em todas as filiais, `total` e `em estoque`
       **idênticos** antes e depois (contagem provada nos dois momentos).
7. [ ] Um usuário de cargo **operador** cadastra item no meio da movimentação; item criado a partir de uma
       linha do checklist **já nasce com o tipo** dela. Editar/desativar item continua recusado a ele.
8. [ ] Nome de item duplicado por acento/espaço é recusado com frase em pt-BR (índice único da chave).
9. [ ] **Nenhum lançamento histórico alterado** (`58 + N`, com N = o que a fase gravou; `guarda_acervo` de pé).
10. [ ] Nenhuma tela oferece "Liberação", "Atrelar" ou "Retorno"; o histórico antigo continua legível.
11. [ ] `npm run lint`, `npm run test`, `npm run build` verdes; roteiro SQL novo rodado nos **dois** bancos
        (ensaio e produção); smoke reexecutável sem falha.

---

## 6. F42 — as telas: itens deixa de ser a exceção ✅ ENTREGUE (v1.47.0, 31/08/2026)

**Objetivo declarado:** quem sabe usar `/ativos` sabe usar `/itens` sem aprender nada novo.
**Sem migration** (a F41 já entregou o banco), sem dependência nova.

### Frente A — `/itens` no casco

- `Pagina` + `CabecalhoDaPagina` + `SecaoDaPagina` + `QuadroDeTabela` + `EstadoVazio`, os componentes que a
  F40 criou e que só `/ativos` usa. `src/lib/layout/consistencia.test.ts` **remove `/itens` da lista de
  pendentes** — a prova de que entrou.
- **Uma tabela**: `Item · Tipo · Total · Em estoque · Em uso · Falta · (selo repor) · ⋯`.
  A comparação entre filiais vira **linha expansível** (chevron, precedente F16), não um toggle que troca
  as colunas.
- **Um conjunto de filtros só**, com a gramática de `AtivosFiltros` (busca + selects rotulados + estado na
  URL) e a paginação de `/ativos` — que passa a paginar **os itens**, não o histórico.
- O selo **"repor"** (estoque mínimo, F12) e o selo **"faltam N"** continuam como estão: são avisos
  diferentes, e a ajuda já explica a diferença.

### Frente B — o histórico ganha rota própria

`/itens/historico`, com os filtros que já existem (`HistoricoFiltros`, estado na URL desde a F28), o export
CSV que já existe e a paginação. Chega-se por botão no cabeçalho de `/itens` e pela linha do item (⋯ →
"Ver histórico deste item"). **O que sai de `/itens` é a seção, não o recurso.**

### Frente C — o lançamento avulso encolhe

- 4 botões (Compra · Saída · Devolução · Ajuste), sem segunda pergunta.
- O carrinho multi-linha permanece (é a I1 do backlog, entregue na F10 e usada).
- A **prévia da regularização**: ao escolher item + quantidade, o diálogo já mostra "1 unidade entra por
  acerto automático" **antes** de gravar, usando a mesma função pura da F41. Nada de surpresa depois.
- `transferir-item-dialog` sai de 11 `useState` para o padrão do sistema (item da `DIVIDA-TECNICA.md`).

### Frente D — as outras superfícies

- **Ficha do ativo:** "Itens que foram junto" ganha o selo "regularizado" e passa a mostrar linhas de
  verdade (hoje são **zero** em produção).
- **`/itens/conferencia`** entra no casco, sem mudar a aritmética (F31).
- **Relatórios:** as tabelas de item passam a exibir os rótulos novos. Snapshot antigo exibe rótulo novo —
  legenda é **render**, não dado (precedente F17); nenhuma contagem muda.
- **Sidebar:** "Itens" ganha as subrotas visíveis (Conferir · Histórico), como o resto do sistema faz.
- **Ajuda:** as capturas e os passos das páginas de item.
- **Versão `1.47.0`** (fase → MINOR), registry em linguagem de operador, tag anotada.

### Checklist de aceite da F42 — **autoverificado em 31/08/2026** ✅

Evidências, número a número, em [`RELATORIO-F42.md`](RELATORIO-F42.md).

1. [x] `/itens` usa os componentes do casco; `consistencia.test.ts` deixa de listá-la como pendente.
       **88 violações em 30 testes → zero**, com as três travas do piloto atualizadas (29→30 rotas,
       3→6 migradas). `/itens/conferencia` e `/itens/historico` entraram junto.
2. [x] Uma tabela, um filtro, uma paginação — e a paginação pagina os itens (`?page=` e `?pp=`,
       o mesmo componente de `/ativos`, com salto de página e seletor de tamanho).
3. [x] A comparação entre filiais existe sem toggle que troque colunas — virou linha expansível
       (o chevron da F16). O param `?visao=` deixou de existir e URL antiga continua abrindo.
4. [x] `/itens/historico` reproduz o recorte pelo link, com export, e **nada** do histórico se
       perdeu — o filtro de FILIAL, que vinha emprestado dos saldos, virou filtro próprio. Link
       antigo redireciona preservando o recorte.
5. [x] O diálogo cabe em 4 botões e mostra a prévia da regularização antes de gravar, pela mesma
       função pura da F41. **893 → 637 linhas.**
6. [x] Nenhum texto de tela cita "Liberação", "Atrelar", "Retorno" ou "Atrelados" — o `grep` e a
       justificativa de cada remanescente estão no relatório.
7. [x] `lint` + `test` + `contraste` + `build` verdes (os quatro do job `verificar`), os dois jobs
       do CI verdes, e o smoke autenticado cobrindo as rotas novas nas duas listas.

**Acrescentado pela ordem de serviço, e também verificado:** "Em uso" bate com o banco (20 = 20 em
produção, 10 = 10 em ensaio, zero divergências), `git diff v1.46.0..HEAD -- supabase/` **vazio**
(nenhuma migration), nenhuma rota sumiu, e a versão `1.47.0` publicada com tag anotada.

---

## 7. O que **não** entra (não-objetivos declarados)

- **Item com patrimônio.** Acessório continua sendo quantidade pura — spec §2. Nada aqui abre essa porta.
- **Reserva por chamado como recurso novo.** Ela sai da tela; se um dia voltar, volta com o vocabulário do
  ativo e fechando pela devolução do equipamento.
- **Catálogo por filial.** `itens` continua **global**; a filial vive no diário. Foi decidido na F38 e o
  motivo continua valendo.
- **Quantidade livre no checklist da devolução.** Continua booleano (1 por linha). Se virar necessidade,
  é fase própria — e a regularização já a acomoda sem mudança de banco.
- **Sincronização com planilha, import recorrente, modo *Atualizar***. Fora de escopo desde a F7.
- **Mexer em `/ativos`.** A opção "fundir itens no acervo" foi considerada e recusada em J3.

---

## 8. Riscos, e as travas da casa que vão brigar

| Risco | Por que dói | Como o plano trata |
|---|---|---|
| Recriar `criar_movimentacao_com_itens` perdendo pedaço | Ela carrega duas classes de trava, a filial derivada sob trava e a etiqueta do erro. Perder qualquer um reabre um bug que já foi pago em produção (`0100`) | Corpo de partida lido do **banco** com `md5` no cabeçalho; roteiro `f38_itens_com_ativo.sql` estendido |
| Estorno passar a falhar | `0121` recusa a transação se algum lançamento da movimentação ficou sem estorno — e a regularização cria um lançamento a mais | `planejarEstorno` planeja o inverso; cenário no roteiro SQL e no Vitest |
| Regularização virar desculpa para inventar estoque | Um acerto automático mal explicado polui o Total e ninguém confia mais no número | Marca `regularizacao` + justificativa obrigatória + amarração à movimentação + checagem em `/dev` que mede o volume. É **visível**, não silencioso |
| `guarda_acervo` (`0081`) | Recusa UPDATE/DELETE em `lancamentos_item` a todo mundo, service role incluso | Tudo neste plano é **INSERT**. A conversão das reservas também |
| Mensagens de erro e ajuda saírem de sincronia | `referencia.test.ts` compara as frases da ajuda com `erros.ts` e derruba o build | Frente D da F41, no mesmo commit |
| Esquecer a versão | Regra 8 do `CLAUDE.md`; `cobertura-changelog.test.ts` derruba o `npm run test` | Item do checklist das duas ordens |
| Rótulo novo em snapshot velho | O relatório congelado passa a exibir "Devolução" onde exibia "Retorno" | Aceito e registrado: legenda é render, não dado (precedente F17). Nenhuma contagem muda |
| Índice único da chave do item colidir | Um índice único que falha ao criar trava a migration | **Já conferido em produção: zero colisão** entre os 22 itens de hoje |

---

## 9. Rollout e prova

Segue o padrão da casa (`RUNBOOK-BANCO.md`), sem novidade: **ensaio primeiro** (`sgmvldiizsrjbxzzpmhh`),
contagens antes e depois, roteiro SQL nos dois bancos, `lint`/`test`/`build`, deploy, smoke reexecutável.

**As contagens de referência de hoje, 31/08/2026** — é contra elas que a F41 prova que não perdeu nada:

| Medida | Hoje |
|---|---|
| `lancamentos_item` | **58** (22 ajuste · 14 saída · 13 entrada · 5 reserva · 4 retorno) |
| … com `movimentacao_id` | **0** |
| … com `colaborador_id` | **0** |
| Pares (item, filial) com lançamento | **30** de 132 possíveis |
| … com estoque disponível | **22** de 132 |
| … com saída em aberto | **4** de 132 |
| … com reserva aberta | **5** |
| `itens` no catálogo | **22** (todos com tipo, 3 com estoque mínimo) |
| `pendencias_item` abertas | **14** |
| Total de unidades no acervo de itens | **264** |
| Ativos · movimentações | 1.614 · 3.431 |

**O teste que importa não é nenhum dos automáticos:** é o Johnny registrar a devolução por desligamento que
originou o print, com os itens que voltaram, e ela **gravar**.

---

## Apêndice A — o caso do print, passo a passo

**Hoje**

1. Devolução por desligamento, um notebook. No checklist, "carregador" e "mochila" marcados como **Voltou**.
2. O checklist resolve os dois tipos em dois itens do catálogo e emite duas linhas de `retorno`, quantidade 1.
3. A RPC grava a movimentação e tenta o primeiro item. `Σsaida − Σretorno` daquele par é **0**.
4. O trigger recusa. A transação inteira aborta. **A devolução do notebook não é registrada.**
5. A tela mostra: *"Nada foi gravado. O 1º item que ia junto foi recusado: O retorno é maior que a
   quantidade liberada em aberto."*
6. O operador tenta contornar lançando os itens à mão como **Atrelar** — e piora: `reserva` só fecha por
   `liberacao` com o mesmo chamado, que a devolução do ativo não emite. O item fica preso, e invisível na
   ficha do ativo (lançamento avulso nasce sem `movimentacao_id`).

**Depois da F41**

1. Mesma tela, mesmos dois cliques em **Voltou**.
2. A RPC lê, sob a trava, que não há saída em aberto de nenhum dos dois. Parte a quantidade: 0 de retorno,
   1 de acerto para cada.
3. Grava, na mesma transação: a devolução do notebook, `ajuste +1` no carregador e `ajuste +1` na mochila,
   ambos marcados como regularização, amarrados àquela movimentação e com a justificativa automática.
4. O painel de sucesso diz: *"Devolução registrada. 2 acessórios entraram no estoque por acerto automático —
   eles não estavam no sistema."*
5. A ficha do ativo passa a mostrar os dois em "Itens que foram junto", com o selo "regularizado".
6. E se ele quiser conferir a prateleira inteira, "Conferir estoque" continua lá — agora como **escolha**,
   não como pré-requisito.

## Apêndice B — mapa de arquivos (onde cada coisa mora hoje)

| Assunto | Arquivo |
|---|---|
| Rótulos e números do item | `src/lib/dominio.ts` (`TIPO_LANCAMENTO_META`, `GRUPO_ITEM_META`) |
| Escolha guiada do tipo | `src/lib/itens/escolha-tipo.ts` |
| Vínculo do retorno com a pessoa | `src/lib/itens/vinculo-retorno.ts` |
| Ponte tipo → item do catálogo | `src/lib/itens/ponte-tipo-item.ts` |
| Regra do lote homogêneo | `src/lib/itens/checklist-lote.ts` |
| Do checklist para as linhas do lote | `src/components/movimentacoes/nova/itens-do-lote.ts` |
| Checklist de dois desfechos | `src/components/movimentacoes/nova/checklist-faltantes.tsx` |
| Seção "Itens que vão junto" | `src/components/movimentacoes/nova/secao-itens-junto.tsx` |
| Derivação do tipo do lançamento | `src/lib/actions/movimentacoes.ts` (`montarItensJunto`) |
| Tradução dos erros do banco | `src/lib/actions/erros.ts` |
| Trigger que valida o lançamento | `supabase/migrations/0118_saldo_colaborador.sql` (base: `0027`) |
| Lote transacional com itens | `supabase/migrations/0117_criar_movimentacao_com_itens.sql` |
| Ciclo da pendência de item | `supabase/migrations/0119_ciclo_pendencia_item.sql` (+ `0122`) |
| Estorno com itens | `supabase/migrations/0121_estorno_com_itens.sql` (+ `0122`) |
| Cadastro híbrido de pessoa (o modelo) | `supabase/migrations/0112`–`0115`, `src/components/movimentacoes/nova/campo-colaborador.tsx`, `src/lib/colaboradores/chave.ts` |
| Tela de itens | `src/app/(app)/itens/page.tsx`, `src/components/itens/**` |
| Casco do sistema de design | `src/components/layout/pagina.tsx`, `quadro-de-tabela.tsx`, `src/lib/layout/consistencia.test.ts` |
