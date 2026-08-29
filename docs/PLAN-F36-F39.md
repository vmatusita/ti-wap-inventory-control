# PLAN-F36 → F39 — O detentor, os itens integrados e os periféricos no termo

> Levantamento e plano escritos em **28/08/2026** sobre o working tree (`main`, versão **1.40.5**,
> **108 migrations** — a última é a `0109`; o número `0029` nunca existiu —, F0→F35 entregues). **Este documento não é ordem de serviço** — cada uma das
> quatro frentes vira uma `docs/prompts/F**-*.md` própria, na ordem do §7. O que ele fecha é o
> *o quê* e o *porquê*, com as doze decisões já tomadas pelo Johnny registradas no §1, para que
> nenhuma ordem nasça com ponta solta.
>
> Método: leitura estática do repositório (migrations `0003`, `0004`, `0014`, `0015`, `0021`,
> `0027`, `0043`, `0050`, `0081`, `0098`, `0104`, `0108`, `0109`), das tags reais dos 7 `.docx`
> (extraídas do `word/document.xml`) e das actions/validators citadas. **Não houve consulta a
> produção nem ao ensaio** — toda contagem citada é a registrada nas atas do próprio repositório.

---

## 1. As decisões que fecham o escopo (Johnny, 28/08/2026)

| # | Assunto | Decisão |
|---|---------|---------|
| D1 | Quando o colaborador sai do ativo | **Todo estado sem detentor.** Colaborador/setor só sobrevivem em `em_uso`, `emprestado` e `reservado`. A regra passa a derivar do **status resultante**, não de uma lista de tipos |
| D2 | Estorno | **Intocado.** Continua restaurando o `snapshot_anterior` — estornar uma devolução devolve o colaborador ao ativo. É o que faz "desfazer" desfazer |
| D3 | Ativos já sujos hoje | **Limpeza silenciosa**: um `update` único, com backup das linhas afetadas antes, **sem** gerar movimentação de ajuste |
| D4 | O que incomoda em itens | (a) entregar/devolver itens junto na movimentação · (b) saldo por colaborador · (c) escala/desempenho |
| D5 | Identidade do colaborador | **Cadastro híbrido**: tabela nova, vínculo por id nos registros **novos**, texto histórico preservado e migrado aos poucos |
| D6 | Desempenho | **Prevenção.** Medir primeiro (`EXPLAIN ANALYZE` com volume simulado); só então decidir entre índice, paginação ou saldo materializado |
| D7 | Tipo do item | **Lista fechada de tipos**, gerida no admin; cada item do catálogo aponta um |
| D8 | Alcance do "tipo em vez do nome" | **Só os periféricos.** O equipamento principal continua saindo com marca, modelo, service tag e patrimônio |
| D9 | Os `.docx` | **Eu edito os 5 modelos de responsabilidade**, com a redação da cláusula **aprovada por você antes** de qualquer coisa ir a produção |
| D10 | Formato no termo | **Linha única, separada por vírgula.** Sem periférico, a seção some do documento |
| D11 | Termos de devolução | **Entram.** `{outros_componentes}` (tag que já existe e hoje sai sempre vazia) passa a listar **o que voltou**; o que faltou continua na linha `{observacao}` |
| D12 | Checklist da devolução | **Passa a ser o catálogo**, e conferir "devolvido" **repõe o estoque**; "faltante" abre a pendência como hoje |
| D13 | Periférico em lote com vários equipamentos | **O operador escolhe** a qual equipamento do lote cada periférico acompanha (padrão: o primeiro). Cada termo lista só o que é dele |

---

## 2. O que o código diz hoje (verificado, não presumido)

### 2.1 O detentor

`aplicar_movimentacao` (corpo vigente = migration `0109`) zera `colaborador_atual`/`setor_atual`
para exatamente seis tipos:

```
devolucao · envio_triagem · triagem_ok · descarte · envio_manutencao · devolucao_fornecedor
```

Ficam **de fora**, e cada um é um furo real:

| Tipo | Estado resultante | Consequência |
|------|-------------------|--------------|
| `ajuste` | qualquer um (o operador declara) | **O furo principal.** A válvula de escape grava `status_resultante` direto e não limpa nada — um ativo chega a `em_estoque` com detentor. A própria `0109` diz isso por escrito, no comentário que justifica o zeramento do `envio_triagem` |
| `retorno_manutencao` | `em_estoque` | Volta ao estoque carregando o que estiver lá (chega detentor pela porta do `ajuste`) |
| `marcar_defasado` | `defasado` | Estado sem dono que aceita dono |
| `troca` | `em_estoque` | Idem |
| `compra` | `em_estoque` | Inócuo hoje (ativo nasce limpo), mas a regra não deveria depender disso |

E `rel_estoque_asof` (a leitura AS-OF dos relatórios, corpo vigente = `0109`) carrega a **mesma
lista, menos um**: são **cinco** tipos — `devolucao_fornecedor` fica de fora **de propósito**,
porque o status `devolvido_fornecedor` é filtrado no `where` final e a linha nunca chega a ser
lida (a própria `0109` registra isso). Os dois lados precisam mudar juntos, senão o estado ao
vivo e o relatório passam a discordar — exigência de par que a `0109` também já registrou.

### 2.2 Os itens

- `lancamentos_item` (`0015`) **não tem `ativo_id` nem `movimentacao_id`.** O único elo com o
  mundo dos ativos é o campo de texto `chamado`. Não existe consulta possível para "o que foi
  junto com este notebook".
- `lancamentos_item.colaborador` é **texto livre e opcional**. `saida` ("Liberação") baixa o
  estoque e registra o nome — **não existe conta por pessoa**: não dá para responder "o que o
  João está com ele".
- O lote de movimentação **não é transacional**: `actions/movimentacoes.ts` insere linha a linha,
  e o comentário do próprio arquivo diz que "as linhas anteriores já estão commitadas". O mesmo
  em `actions/itens.ts` (o carrinho é um `for` de inserts). O precedente de escrita
  tudo-ou-nada existe e é bom: `criar_compra_lote` (`0008`), `devolver_ao_fornecedor` (`0045`),
  `transferir_item` (`0104`).
- O checklist de itens faltantes da devolução são **7 códigos fixos no código**
  (`ACESSORIOS_DEVOLUCAO` em `src/lib/dominio.ts`), que **não conversam com o catálogo `itens`**
  e **não tocam o estoque**. Marcar = faltante → abre `pendencias_item` (`0050`/`0051`).
- O catálogo `itens` tem `nome`, `grupo` (`acessorio | componente`), `ativo`, `ordem`,
  `estoque_minimo`. **Nenhum campo de tipo.**
- Saldo é **derivado somando todos os lançamentos a cada leitura** — no trigger
  `valida_lancamento_item` e na RPC `rel_saldo_itens` (nasce na `0016`, corpo vigente na `0027`).
  Correto por desenho (o diário manda), e é exatamente o ponto que o D6 manda medir antes de mexer.

### 2.3 Os termos

Tags **reais** dos 7 modelos, extraídas do `word/document.xml` de cada arquivo:

| Modelo | Tags |
|--------|------|
| `responsabilidade-notebook` · `-desktop` · `-monitor-interno` · `-monitor-homeoffice` | `{colaborador}` `{marca}` `{modelo}` `{service_tag}` `{patrimonio}` `{chamado}` `{cidade}` `{data_extenso}` |
| `responsabilidade-celular` | as acima **+** `{telefone}` `{imei}` `{pulsus}` `{obs}` |
| `devolucao-equipamento` · `devolucao-desligamento` | `{data_mes_ano}` `{colaborador}` `{descricao}` `{series}` `{patrimonios}` `{marcas_modelos}` **`{outros_componentes}`** `{observacao}` `{tecnico}` `{cidade}` `{data_extenso}` |

Duas conclusões que governam a F39:

1. **Nenhum dos 5 termos de responsabilidade tem onde listar periférico.** O arquivo Word precisa
   mudar — não há atalho por código.
2. **Os 2 de devolução já têm o lugar pronto.** `{outros_componentes}` existe e
   `actions/termos.ts` passa `''` fixo para ela desde a F5A. Preenchê-la **não toca em `.docx`**.

---

## 3. F36 — O detentor sai junto com o ativo

**Tamanho:** pequena e independente. Não depende de nenhuma outra frente e pode ir sozinha.

### 3.1 A regra nova

A lista de seis tipos some. No lugar entra uma função de vocabulário, e o zeramento passa a
perguntar ao **estado resultante**:

```sql
-- migration 0110
create or replace function public.status_tem_detentor(p public.status_ativo)
returns boolean language sql immutable set search_path = public as $$
  select p in ('em_uso', 'emprestado', 'reservado');
$$;
```

Dentro de `aplicar_movimentacao`, o `case` de `colaborador_atual`/`setor_atual` vira:

```sql
colaborador_atual = case
  when not public.status_tem_detentor(v_novo)              then null   -- ramo NOVO, primeiro
  when new.tipo in ('saida','emprestimo','reserva')        then new.colaborador
  else colaborador_atual end,
```

**A ordem dos ramos é a regra.** O ramo novo vem primeiro e **absorve inteira** a lista de seis
de hoje (`devolucao`→`em_estoque`, `envio_triagem`→`em_triagem`, `triagem_ok`→`em_estoque`,
`descarte`→`descartado`, `envio_manutencao`→`em_manutencao`,
`devolucao_fornecedor`→`devolvido_fornecedor` — todos estados sem detentor), e ainda fecha
`ajuste`, `retorno_manutencao`, `marcar_defasado`, `troca` e `compra`. `transferencia` mantém o
status, então um ativo `em_uso` transferido **continua com o dono** — como deve.

### 3.2 O que NÃO muda

- **`status_apos_movimentacao` fica byte a byte.** Nenhuma transição nasce, morre ou muda de
  destino; o teste `src/lib/validators/transicoes-sql.test.ts`, que reconstrói a matriz a partir
  da migration de maior número que define a função, **continua lendo a `0109`**.
- **O ramo do `estorno` fica byte a byte** (D2). Ele retorna antes de chegar ao `update`.
- Filial, pendência, termo, snapshot e a guarda de identidade por filial (`0099`): intocados.

### 3.3 O espelho as-of (obrigatório, não opcional)

`rel_estoque_asof` recebe o mesmo tratamento, pela mesma razão que a `0109` documentou: sem isso
o mesmo ativo aparece **sem** detentor no estado ao vivo e **com** o detentor antigo na leitura
as-of do relatório.

```sql
colaborador = case
  when u.tipo is null                                                          then null
  when not public.status_tem_detentor(coalesce(u.status_resultante,'em_estoque')) then null
  when u.tipo in ('saida','emprestimo','reserva')                              then u.colaborador
  else u.snapshot_anterior ->> 'colaborador' end
```

Efeito colateral bom: a lista de cinco vira **uma pergunta só**, e `devolvido_fornecedor` passa
a ser coberto pela mesma regra — inócuo (a linha continua filtrada no `where`), mas some a
assimetria que hoje obriga quem lê as duas funções a lembrar por que uma tem seis e a outra cinco.

⚠ **Isto é retroativo.** Relatórios as-of de datas passadas passam a mostrar sem detentor os
ativos cujo último evento foi um `ajuste` para estado sem dono carregando colaborador. É a
correção, e é coerente com o backfill do §3.4 — mas **precisa ser contada antes** (quantas linhas
mudam de leitura) e registrada na ata.

### 3.4 O passado (migration `0111`, separada de propósito)

```sql
update public.ativos
   set colaborador_atual = null, setor_atual = null, updated_at = now()
 where not public.status_tem_detentor(status)
   and (colaborador_atual is not null or setor_atual is not null);
```

- **Não bate no gate** do modo automático (o classificador barra `delete from public.ativos` /
  `public.movimentacoes`; isto é `update`) e **não bate na `guarda_acervo`** (`0081`), cujo
  trigger em `ativos` é `before delete` apenas — `update` em `ativos` é operação normal e
  documentada como tal.
- **Mas é operação destrutiva pelo CLAUDE.md**, então o protocolo vale inteiro: contagem e
  **export das linhas afetadas em JSON antes**, dry-run (`select` com o mesmo `where`), apply,
  contagens depois, ata em `docs/DECISOES.md`.
- Migration **separada** da `0110` de propósito: a `0110` é `create or replace` puro (caminho A
  do `RUNBOOK-BANCO.md`, ensaio→produção sem cerimônia); a `0111` mexe em dado e merece o seu
  próprio par de contagens.

### 3.5 A trava que impede a volta

Décima checagem em `dev_checagens_integridade()` (hoje nove, corpo vigente `0098`), com a mesma
assinatura `(chave text, total bigint, amostra text[])`:

```
detentor_em_estado_sem_dono → ativos com status sem detentor e colaborador_atual/setor_atual preenchidos
```

Em operação normal ela é **sempre zero**. Se subir, alguém abriu um caminho novo de escrita que
não passa pelo trigger — e o `/dev` conta antes de o relatório mentir.

⚠ **A migration sozinha não basta.** O catálogo curado das checagens vive em
`CHECAGENS` (`src/lib/queries/dev.ts`); sem uma entrada nova ali, a décima aparece na tela com a
chave crua no lugar do nome — a "rede permanente" que a revisão de 07/08/2026 instalou em
`src/lib/validators/dev-integridade.ts` garante que ela **apareça**, não que apareça legível. Os
dois arquivos entram no mesmo commit.

### 3.6 Testes

- `supabase/tests/f36_detentor.sql` — roteiro auto-verificável no molde do
  `f34_triagem_reserva.sql`: `ajuste` para `em_estoque` zera; `ajuste` para `em_uso` **não**
  zera; `retorno_manutencao` zera; `marcar_defasado` zera; `transferencia` de ativo `em_uso`
  **preserva**; `estorno` de devolução **devolve** o colaborador (D2). Tudo em `begin;…rollback;`.
- Teste TS de função pura para o vocabulário `statusTemDetentor` em `src/lib/dominio.ts`,
  **espelhado** por um teste que lê a migration e compara a lista de estados com detentor — no
  molde de `transicoes-sql.test.ts` e de `marcadores-sql.test.ts`, as duas travas TS↔SQL que já
  existem. ⚠ Não confundir com a "terceira trava" que a `docs/DIVIDA-TECNICA.md` pede no item
  **W**: aquela é um teste de grep contra `current_date` cru em migration nova (bug de fuso), e
  **continua aberta** depois da F36.

### 3.7 Definição de pronto

`lint`/`build`/`test` limpos · roteiro SQL 100% ✓ em ensaio e produção · contagens antes/depois
do backfill registradas · checagem 10 em zero · `CHANGELOG` + `registry.ts` + tag (§8).

---

## 4. F37 — Fundação: quem é a pessoa e o que é o item

> ✅ **EXECUTADA em 28/08/2026** pela ordem `docs/prompts/F37-fundacao-colaboradores-tipos-ultracode.md`
> (**v1.42.0**, migrations `0112`/`0113`/`0114`). Evidências em `docs/RELATORIO-F37.md`.
>
> **Três coisas saíram diferentes do que este §4 rascunhou, e a ordem mandou (ela é a régua acima
> deste plano). As três estão em ata em `docs/DECISOES.md` (2026-08-28 · F37):**
>
> 1. **A ponta solta do §4.1 foi fechada: o passado se liga por CHAVE, nunca por UPDATE.** O
>    texto abaixo diz "permite amarrar em lote" sem dizer como. Não há como: `guarda_acervo`
>    (`0081`) recusa UPDATE em `movimentacoes`/`lancamentos_item` para **todo mundo, service
>    role incluso**. A tela de consolidação **cria cadastros** a partir das chaves distintas
>    encontradas no texto; a resolução do passado é por `nome_chave` **na leitura**.
> 2. **A chave virou uma FUNÇÃO nomeada** (`public.colaborador_chave(text)`), em vez de uma
>    expressão inline na coluna gerada — a mesma expressão serve a coluna e a view da fila, e dá
>    uma âncora única para a guarda TS↔SQL.
> 3. **A expressão mudou em dois pontos:** `btrim` vem **depois** do colapso (senão `'	João'`
>    ficaria com um espaço grudado na chave) e o `s` foi trocado por uma **classe explícita**
>    `[ 	
]` — o `s` do Postgres é `[[:space:]]` (sensível a locale) e o do JavaScript
>    inclui NBSP: **não são o mesmo conjunto**, e é essa diferença que faria o vínculo falhar em
>    silêncio. `ñ/Ñ` entrou na tabela de acentos.
>
> **E uma coisa NÃO saiu:** a curva de desempenho do §4.3. O harness
> (`scripts/perf/medir-itens.mjs`) está escrito e guardado, mas o projeto de **ensaio está
> pausado** e produção é proibida para ele (§C.2 da ordem) — a curva dos três patamares é a
> **pendência número um** da fase. O que foi medido é a âncora do volume de hoje, só-leitura
> (`docs/perf/f37-ancora-producao.json`). **Nenhuma otimização entrou**, que era o ponto do D6.


**Por que uma fase só de fundação:** as três coisas que a F38 e a F39 precisam (uma pessoa que é
sempre a mesma pessoa, um tipo que é sempre o mesmo tipo, e um número medido de desempenho) são
migrations aditivas e telas de cadastro. Misturá-las com a mudança de fluxo da F38 faria uma fase
grande demais para um rollback limpo.

### 4.1 Cadastro de colaboradores — o modelo híbrido (D5)

Hoje colaborador é texto livre em três lugares: `ativos.colaborador_atual`,
`movimentacoes.colaborador` e `lancamentos_item.colaborador`. Pelas contagens registradas na
`0104` (09/08/2026), o acervo de produção tinha **1.654 ativos** e **3.280 movimentações** — todo
esse nome foi digitado à mão. Uma conta por pessoa em cima disso divide "João Silva", "Joao
Silva" e "João S." em três pessoas.

```sql
-- migration 0112
create table public.colaboradores (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  matricula   text,
  setor       text,
  filial_id   smallint references public.filiais (id),
  ativo       boolean not null default true,
  criado_por  uuid not null references public.profiles (id),
  created_at  timestamptz not null default now(),
  -- Chave de deduplicação: minúsculas, sem acento, espaços colapsados. Coluna
  -- GERADA (precedente `profiles.nome`, 0057) — nada de `unaccent`, que é
  -- extensão; `translate` e `regexp_replace` de 4 argumentos são IMMUTABLE.
  nome_chave  text generated always as (
    lower(regexp_replace(translate(btrim(nome),
      'áàâãäéèêëíìîïóòôõöúùûüçÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC'), '\s+', ' ', 'g'))
  ) stored
);
create unique index colaboradores_nome_chave_uidx on public.colaboradores (nome_chave);
```

E o vínculo, **sempre anulável** (migration `0113`):

```sql
alter table public.movimentacoes   add column colaborador_id uuid references public.colaboradores (id);
alter table public.lancamentos_item add column colaborador_id uuid references public.colaboradores (id);
```

**Como o híbrido funciona na prática:**

- O campo de colaborador do wizard vira um combobox sobre `colaboradores` **com criação inline**
  — o padrão que a F10 já validou no combobox de itens (`itemInlineSchema`).
- Todo registro novo grava **os dois**: `colaborador_id` **e** o texto (o texto continua sendo o
  snapshot da época, doutrina do repositório inteiro — a pendência de item guarda o nome, não a
  pessoa).
- **O histórico não é tocado.** Registro antigo tem texto e `colaborador_id` nulo.
- Uma tela `/admin/colaboradores` lista os nomes de texto que ainda não têm CADASTRO, agrupados
  pela `nome_chave`, e permite **criar os cadastros** em lote. Migração por uso, sem parar nada.
  ⚠ **Corrigido em 28/08/2026 (execução da F37):** a redação original — "amarrar em lote" — sugere
  um UPDATE em histórico, que **não existe e não pode existir**. `guarda_acervo` (`0081`) recusa
  UPDATE em `movimentacoes`/`lancamentos_item` para todo mundo, service role incluso. A tela
  **cria cadastro**; a ligação do passado é por `nome_chave` **na leitura**, e o `colaborador_id`
  só é gravado **no INSERT do registro novo**.
- ⚠ **Consequência a dizer em voz alta:** enquanto houver texto sem vínculo, o saldo por pessoa
  (§5.3) cobre só o que está vinculado. A tela mostra isso na cara — "N lançamentos antigos sem
  vínculo" — em vez de fingir um total completo.

### 4.2 Tipos de item (D7)

```sql
-- migration 0114
create table public.tipos_item (
  id     smallint generated always as identity primary key,
  slug   text not null unique,   -- 'fone', 'mouse', 'carregador'...
  rotulo text not null,          -- 'Fone de ouvido', 'Mouse', 'Carregador'
  ativo  boolean not null default true,
  ordem  int not null default 0
);
alter table public.itens add column tipo_id smallint references public.tipos_item (id);
```

**O seed são os 7 slugs que já existem no código** — `carregador`, `mochila`, `mouse`, `teclado`,
`mousepad`, `fone`, `cabo` (`ACESSORIOS_DEVOLUCAO`, `src/lib/dominio.ts`). Isso não é
conveniência: `movimentacoes.itens_faltantes` e `pendencias_item.item` guardam **esses mesmos
literais** no histórico. Mantendo os slugs, todo registro antigo continua resolvendo o rótulo, e
`ACESSORIOS_DEVOLUCAO` sai do código sem quebrar uma linha de histórico.

- O rótulo de `fone` passa de "Fone" para **"Fone de ouvido"** — é o exemplo do seu pedido. Muda
  o que as pendências antigas **exibem** (não o que guardam). É melhoria, mas entra na ata.
- `itens.tipo_id` nasce **anulável**: o catálogo atual não tem tipo e ninguém vai parar para
  preencher. `admin/itens` ganha a coluna, com um selo discreto nos itens sem tipo.
- **Item sem tipo não vai para o termo pelo nome.** Ele é omitido da linha e o diálogo do termo
  avisa ("N itens sem tipo cadastrado não entraram no termo — cadastre em Administração →
  Itens"). Documento assinado não recebe "Fone WAAW 10 Energy" por acidente (D8).

### 4.3 A medição, antes de otimizar (D6)

Entra como **etapa da fase, com número no relatório**, no molde do que a F33 fez com o TTFB:

1. `scripts/perf/medir-itens.mjs` popula um banco de ensaio com volume simulado (10 mil, 100 mil
   e 500 mil lançamentos, fictícios) e mede `EXPLAIN ANALYZE` de `rel_saldo_itens`,
   `rel_mov_itens`, do trigger `valida_lancamento_item` e do histórico paginado.
2. O relatório da fase publica a curva.
3. **Só então** a decisão: índice novo, paginação, ou saldo materializado por item×filial mantido
   por trigger com rotina de reconciliação. **Nenhuma das três entra nesta fase** — otimizar
   antes do número é exatamente o erro que a F33 documentou ter cometido e revertido.

### 4.4 Definição de pronto

Duas telas de cadastro no ar · zero mudança de comportamento no fluxo de movimentação · nenhum
registro histórico alterado · a curva de desempenho publicada em `docs/RELATORIO-F37.md`.

---

## 5. F38 — Os itens andam com o ativo

> ✅ **EXECUTADA em 28/08/2026** pela ordem `docs/prompts/F38-itens-andam-com-o-ativo-ultracode.md`
> (**v1.43.0**, migrations `0116`–`0121`). Evidências em `docs/RELATORIO-F38.md`.
>
> **Quatro coisas saíram diferentes do que este §5 rascunhou, e a ordem mandou (ela é a régua
> acima deste plano). As quatro estão em ata em `docs/DECISOES.md` (2026-08-28 · F38):**
>
> 1. **A numeração das migrations mudou.** O §5.1 numerou o vínculo como `0115` e o §5.3 o saldo
>    por pessoa como `0116`; na execução ficaram `0116` (vínculo), `0117` (RPC do lote), `0118`
>    (saldo por pessoa), `0119` (ciclo da pendência), `0120` (índice) e `0121` (estorno acoplado)
>    — porque a `0115` já tinha sido usada pela revisão de código da F37 (v1.42.1).
> 2. **`lanc_item_colaborador_idx` virou migration própria, e só entrou DEPOIS da curva.** O
>    §5.1 previa criá-lo junto com o vínculo; na execução ele saiu do DDL da `0116` e nasceu como
>    a `0120`, só depois de uma segunda população dirigida medir o efeito (111,56 ms → 9,22 ms,
>    12,1× aos 500 mil) — com o número medido no nome, que é o que o D6 exige.
> 3. **A `baixa` grava DOIS lançamentos, não um.** O §5.4 propunha só um `ajuste` negativo; o
>    Johnny fechou a ponta em 28/08/2026 e a ordem determinou `retorno` **+** `ajuste` negativo,
>    porque `ajuste` sozinho não entra na conta por pessoa (`Σsaida − Σretorno`) e deixaria o item
>    na conta dela para sempre.
> 4. **O estorno acoplado e a coluna `pendencia_item_id` não estavam neste §5.** Os dois entraram
>    na execução: a RPC `estornar_movimentacao_com_itens` (§B.5 da ordem) desfaz o conjunto ou
>    recusa, e `lancamentos_item.pendencia_item_id` (`0119`) é o elo que prova, dentro da
>    transação, que reabrir pendência nunca deixa lançamento órfão.

**Depende da F37** (precisa de `colaboradores` e de `tipos_item`).

### 5.1 O vínculo que não existe (migration `0115`)

```sql
alter table public.lancamentos_item
  add column movimentacao_id uuid references public.movimentacoes (id);
create index lanc_item_mov_idx        on public.lancamentos_item (movimentacao_id);
create index lanc_item_colaborador_idx on public.lancamentos_item (colaborador_id, item_id, filial_id);
```

⚠ **Na execução (28/08/2026): virou a migration `0116`, e `lanc_item_colaborador_idx` SAIU deste
DDL** — nasceu depois, sozinho, como a `0120`, só depois de a curva medir o efeito. Ver
divergência (2) no bloco EXECUTADA acima.

Só `movimentacao_id`, **não** `ativo_id`: a movimentação já aponta o ativo, e uma segunda cópia
da mesma verdade é um lugar novo para os dois discordarem. "O que foi junto com este notebook" é
um join. FK **imediata** (não `deferrable` como em `pendencias_item`): ali o problema era um
trigger `before insert` em `movimentacoes`; aqui a RPC insere a movimentação **antes** dos itens,
na mesma transação.

D13 se materializa aqui: cada linha de item aponta **uma** movimentação do lote — o fone aponta a
movimentação do notebook, o cabo aponta a do monitor.

### 5.2 A RPC transacional (migration `0117`)

`criar_movimentacao_com_itens(p_movimentacoes jsonb, p_itens jsonb)` — grava o lote de
movimentações **e** os lançamentos de item **tudo ou nada**.

- **`security invoker`**, como `criar_compra_lote` (corpo vigente na `0064`),
  `devolver_ao_fornecedor` (corpo vigente na `0047`) e `transferir_item` (`0104`). As RPCs de
  escrita de acervo desta casa são invoker de propósito: a RLS e as policies de filial continuam
  sendo a autorização. ⚠ Detalhe a corrigir de passagem: as três são invoker **por omissão da
  cláusula**, não por declaração — as RPCs de leitura (`0011`, `0016`) escrevem `security invoker`
  na cara. A RPC nova declara a palavra.
- Isto **conserta de lambuja** um defeito conhecido do lote de movimentação: hoje o `for` de
  inserts commita linha a linha e uma falha no meio deixa metade registrada
  (`actions/movimentacoes.ts` documenta isso). ⚠ **Mas é mudança de comportamento visível** — o
  painel de sucesso parcial deixa de existir para esse caminho. Precisa entrar na ordem como item
  explícito, com o texto da tela revisto, não como efeito colateral.
- O tipo do lançamento continua sendo o que já existe — **nenhum valor de enum novo**, e portanto
  **nenhuma migration de enum separada** (a dança `0108`/`0109`, `0044`/`0045`, `0046`/`0047` não
  se repete aqui):
  - entrega → `saida` ("Liberação") com `colaborador_id` e `movimentacao_id`;
  - devolução → `retorno` ("Retorno"), que já existe desde a `0027`.

### 5.3 Saldo por colaborador (migration `0116`)

⚠ **Na execução (28/08/2026): virou a migration `0118`** — a `0116` foi o vínculo do §5.1, e a
`0117` a RPC do §5.2. Ver divergência (1) no bloco EXECUTADA acima.

A conta é uma **partição** das fórmulas que já existem na `0027`, não uma fórmula nova:

```
com_a_pessoa(item, filial, colaborador) = Σ saida(colaborador_id) − Σ retorno(colaborador_id)
```

Somando todas as pessoas mais os lançamentos sem vínculo, dá exatamente o `liberados` de hoje.
Nada do que a tela de itens mostra muda de número.

Uma guarda nova no `valida_lancamento_item`, **espelho exato** da guarda que já existe para
`liberacao` contra `reserva`: um `retorno` que nomeia uma pessoa **não pode exceder o que aquela
pessoa tem** daquele item naquela filial. Retorno sem `colaborador_id` (o caminho de hoje)
continua valendo como está — o histórico não vira erro retroativo.

Leitura: `rel_saldo_colaborador(p_colaborador uuid)` alimenta um bloco "Com esta pessoa" na
ficha do colaborador e no diálogo de devolução.

### 5.4 O checklist da devolução vira o catálogo (D12)

Hoje: 7 códigos fixos, marcar = **faltante**, nada toca o estoque.
Depois: a lista vem de `tipos_item`, e cada linha tem **dois desfechos**:

| Marca | Efeito |
|-------|--------|
| **Devolvido** | Lançamento `retorno` → repõe o estoque da filial e baixa da conta da pessoa |
| **Faltante** | `pendencias_item` aberta, exatamente como hoje (`0050`/`0051`), e o item **continua** na conta da pessoa |

E o ciclo fecha — **proposta minha, precisa do seu OK antes da ordem de serviço**, porque
ninguém decidiu isto ainda: ao resolver a pendência em `/pendencias`, o desfecho que já existe
vira lançamento. `recuperado` → `retorno` (repõe estoque, baixa da pessoa); `baixa` → `ajuste`
negativo com a justificativa (some do total, baixa da pessoa). Sem isso, um item dado como
perdido fica na conta da pessoa para sempre.

⚠ **O Johnny decidiu diferente do proposto (28/08/2026), e a ordem foi escrita com a decisão
dele:** `baixa` grava **`retorno` + `ajuste` negativo** (dois lançamentos), não só o `ajuste`. Um
`ajuste` sozinho não entra em `Σsaida − Σretorno` (a conta por pessoa do §5.3) — deixaria o item
na conta da pessoa para sempre, o furo exato que este parágrafo existe para fechar. Ver
divergência (3) no bloco EXECUTADA acima.

⚠ **Entrega antiga funciona igual.** Como o checklist mostra os **tipos do catálogo** (e não "o
que esta pessoa recebeu"), devolução de equipamento entregue antes desta fase continua
conferível — foi por isso que o D12 escolheu esta opção e não a lista derivada da entrega.

### 5.5 Riscos desta fase

| Risco | Mitigação |
|-------|-----------|
| A RPC transacional muda o comportamento do sucesso parcial | Item explícito na ordem, com o texto do painel revisto e roteiro E2E |
| `retorno` com pessoa passa a poder ser recusado pelo trigger | A guarda só vale para lançamento **com** `colaborador_id` — nenhum caminho de hoje muda |
| Rótulo de `fone` muda em pendências antigas | É exibição, não dado; registrado na ata |
| Escopo inchar para dentro da F39 | O termo **não** é tocado aqui. A F38 entrega o dado; a F39 o imprime |

---

## 6. F39 — O termo diz o que foi junto

**Depende da F38** (é ela que sabe quais periféricos foram com aquele equipamento).
**Zero migration** — o que muda é `.docx`, Zod e uma função pura.

### 6.1 Os 5 `.docx` de responsabilidade (D9)

O arquivo Word precisa de um lugar novo. **Não pelo Word**: reabrir e salvar reescreve o pacote
inteiro (ordem das partes, `rels`, revisão do editor) e nenhuma inspeção prova depois que só a
seção nova mudou. O caminho é o que a F25 já usou e provou —
`scripts/termos/retaguear-cidade.mjs`: um script que edita `word/document.xml`, roda em **modo
conferência por padrão** e só grava com `--aplicar`, imprimindo o sha de cada parte antes e
depois para provar que **todo o resto saiu byte a byte igual**.

`scripts/termos/inserir-acessorios.mjs` faz o mesmo, com uma diferença que precisa ser dita: a
F25 **substituiu** uma substring; aqui se **insere um parágrafo**. O `<w:p>` novo clona as
propriedades de formatação de um parágrafo vizinho do próprio modelo, para herdar fonte, corpo e
espaçamento sem inventar estilo. Por isso a conferência é **visual, e é sua** — o script prova
que nada mais mudou, não que a página ficou bonita.

**Duas coisas que dependem de você antes de a ordem começar:**

1. **A redação da cláusula.** Minha proposta, no registro dos modelos atuais, para você aprovar
   ou trocar:

   > **Acompanham o equipamento os seguintes acessórios e periféricos:** {acessorios}

   Com D10 valendo: `{acessorios}` sai como linha única separada por vírgula
   (`Fone de ouvido, Mouse, Teclado, Mochila`) e, **não havendo periférico, o parágrafo inteiro
   some do documento** — bloco condicional `{#tem_acessorios}…{/tem_acessorios}` do
   docxtemplater, não uma linha vazia pendurada.

2. **Onde entra**, em cada um dos 5. O lugar natural é logo após o bloco de identificação do
   equipamento e antes das cláusulas de responsabilidade — mas os 5 modelos não têm a mesma
   diagramação, e essa é uma decisão de documento assinado.

**Ordem de trabalho:** eu edito → gero PDF dos 5 lado a lado com os atuais → você confere →
só então os `.docx` entram no repositório e a fase segue.

### 6.2 O que o código faz com isso

| Onde | Mudança |
|------|---------|
| `src/lib/validators/termo.ts` | `camposTermoSchema` é de **chaves fechadas** — ganha `acessorios: z.string().max(600)`. `outros_componentes` já existe |
| `src/lib/termos/acessorios.ts` **(novo)** | Função **pura** que recebe os lançamentos vinculados à movimentação e devolve a linha: agrupa por `tipo_id`, ordena pela `ordem` do tipo, **descarta item sem tipo** e devolve também a contagem de descartados (para o aviso). Módulo puro com teste próprio, no molde de `termos/preparo.ts` e pelo mesmo motivo: caso de borda em Server Action ninguém escreve |
| `src/lib/actions/termos.ts` | `prepararTermo` passa a ler os lançamentos da movimentação e a preencher `acessorios` (responsabilidade) e `outros_componentes` (devolução). **Editável como todo campo do termo** (§3.9 do `PLANO-TERMOS`) — o pré-preenchimento é sugestão, nunca trava |
| `src/lib/dominio.ts` | `ACESSORIOS_DEVOLUCAO`/`ACESSORIO_ROTULO` saem — o vocabulário passa a vir de `tipos_item` (F37). `rotuloAcessorio` vira o fallback pelo slug, que é o que faz o histórico continuar legível |

`termos_gerados.dados` é `jsonb` e guarda o payload inteiro do merge: **o termo emitido continua
sendo o snapshot do que foi para o papel**, sem migration nenhuma. Reabrir um termo antigo segue
funcionando pelo `mesclarCamposSalvos` (`preparo.ts`), que já trata chave ausente — foi
exatamente para isso que ele nasceu na F25.

### 6.3 O termo de devolução (D11)

`{outros_componentes}` — hoje `''` fixo em `actions/termos.ts` — passa a listar **o que voltou**,
pela mesma função pura e pelo mesmo formato de linha única. **O que faltou continua na linha
`{observacao}`**, gerada por `observacaoSugestao(itensFaltantes)`, que **não muda**. As duas
linhas dizem coisas diferentes e o documento fica sem ambiguidade.

Nenhum `.docx` de devolução é tocado.

### 6.4 O que continua exatamente como está (D8)

O equipamento principal do termo de responsabilidade segue saindo com `{marca}`, `{modelo}`,
`{service_tag}` e `{patrimonio}`. A regra "tipo em vez do nome inteiro" vale **só para os
periféricos** — é marca, modelo e patrimônio que amarram a responsabilidade a um bem específico.

---

## 7. Ordem, dependências e rollout

```
F36  detentor              ──────────────────►  independente, pode ir primeiro e sozinha
F37  colaboradores + tipos ──┬───────────────►  fundação, aditiva, sem mudar fluxo
                             │
F38  itens andam com o ativo ┴──┬────────────►  precisa de F37
                                │
F39  o termo diz o que foi junto┴────────────►  precisa de F38 + seu aval nos .docx
```

| Fase | Migrations | Toca dado? | Caminho `RUNBOOK-BANCO.md` |
|------|-----------|-----------|---------------------------|
| F36 | `0110` (3 funções por `create or replace` puro) | não | **A** — ensaio → produção |
| F36 | `0111` (backfill do detentor) | **sim** | **A**, com protocolo destrutivo do `CLAUDE.md`: backup JSON → dry-run → apply → contagens |
| F37 | `0112` `0113` `0114` (tabelas + colunas anuláveis + seed de vocabulário) | não | **A** |
| F38 | `0116`–`0121` (vínculo, RPC do lote, saldo por pessoa, ciclo da pendência, índice, estorno acoplado) | não | **A** |
| F39 | nenhuma | não | — |

Nenhuma delas bate no gate do modo automático (nenhuma contém `delete from public.ativos` ou
`delete from public.movimentacoes`), então **nenhuma exige apply manual no SQL Editor**.

**Base de toda recriação de função:** o corpo **vigente lido do banco** por
`pg_get_functiondef`, com o md5 registrado na migration — nunca o arquivo da migration antiga.
É a lição escrita na `0047` e repetida na `0109`, e é ela que impede regressão silenciosa.

---

## 8. Versionamento (item 8 do `CLAUDE.md`, sem exceção)

Toda entrada nova no `CHANGELOG.md` exige versão. Partindo de **1.40.5**, quatro fases = quatro
**minors**:

| Fase | Versão | Título provável |
|------|--------|-----------------|
| F36 | `1.41.0` | O equipamento volta para o estoque sem dono |
| F37 | `1.42.0` | Cadastro de pessoas e tipos de item |
| F38 | `1.43.0` | Os acessórios andam junto com o equipamento |
| F39 | `1.44.0` | O termo lista o que foi junto |

Cada uma: bump no `package.json` · entrada no topo de `src/lib/versoes/registry.ts` com 2 a 6
mudanças **em linguagem de operador** (há teste que recusa vocabulário de desenvolvedor) · tag
anotada `v<versão>` publicada.

---

## 9. O que este plano NÃO faz

- **Não otimiza nada às cegas.** Saldo materializado, índice novo e paginação ficam fora até a
  medição da F37 dizer que fazem falta (D6).
- **Não migra o histórico de colaborador.** O híbrido (D5) foi escolhido justamente para não
  fazer isso; a deduplicação é por uso, na tela de vínculo.
- **Não transforma acessório em ativo.** A pergunta 6 da spec §13 segue respondida: acessório é
  quantidade pura, sem patrimônio e sem máquina de estados.
- **Não muda a máquina de estados.** A F36 mexe no que a movimentação **grava**, nunca no que ela
  **permite** — `status_apos_movimentacao` fica byte a byte.
- **Não toca o modelo de acesso.** Nenhuma policy nova, nenhum cargo novo; as RPCs seguem o
  precedente invoker das RPCs de acervo.
- **Não adiciona dependência.** Tudo com a stack fechada: `pizzip` e `docxtemplater` já estão no
  projeto e o script de retag tem precedente rodando.

---

## 10. As três coisas que dependem de você

1. **A redação da cláusula de acessórios** dos 5 termos de responsabilidade — aprovar a proposta
   do §6.1 ou me passar a sua. **Bloqueia a F39.**
2. **A conferência visual dos 5 `.docx`** depois da inserção, contra os PDFs lado a lado.
   **Bloqueia a subida da F39 a produção.**
3. **O OK no fechamento do ciclo da pendência de item** (§5.4): pendência resolvida vira
   lançamento (`recuperado` → retorno · `baixa` → ajuste negativo). É proposta minha, não
   decisão sua — sem ela, item dado como perdido fica na conta da pessoa para sempre.
   **Bloqueia a F38.**

---

*Escrito em 28/08/2026 por leitura estática do working tree. Nenhuma consulta a produção ou
ensaio nesta sessão — as contagens citadas são as registradas nas atas do próprio repositório.*
