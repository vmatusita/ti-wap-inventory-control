# RELATÓRIO F36 — O detentor sai junto com o ativo

> Frente única do `docs/PLAN-F36-F39.md` §3, aplicada em **28/08/2026** direto do plano (não houve
> ordem de serviço em `docs/prompts/` — o Johnny mandou aplicar a frente). Sucede a v1.40.5.
> Versão publicada: **`1.41.0`**. Duas migrations: `0110` (cinco funções, nenhuma toca dado) e
> `0111` (o backfill do passado, 4 linhas).

---

## 1. O defeito, em uma frase

Quem apagava `colaborador_atual`/`setor_atual` era uma **lista de tipos de movimentação** — e uma
lista de tipos não é a mesma coisa que a regra que ela tentava expressar. O resultado era um
equipamento **"Em estoque com o Fulano"**: o `ajuste`, que é a válvula de escape e grava o estado
resultante direto, não limpava nada.

Pior: a mesma regra existia em **três cópias**, e as três já estavam diferentes umas das outras.

| Onde | O que a cópia dizia | O que faltava |
|---|---|---|
| `aplicar_movimentacao` (`0109`) | **seis TIPOS**: `devolucao`, `envio_triagem`, `triagem_ok`, `descarte`, `envio_manutencao`, `devolucao_fornecedor` | `ajuste`, `retorno_manutencao`, `marcar_defasado`, `troca`, `compra` |
| `rel_estoque_asof` (`0109`) | **cinco TIPOS** (a mesma lista menos `devolucao_fornecedor`) | os mesmos cinco, mais a assimetria com a função acima |
| `forcar_estado_ativo` (`0084`) | **cinco ESTADOS** escritos à mão | `defasado`, deixado de fora **de propósito**, com comentário |

## 2. A regra nova

Uma pergunta só, feita ao **estado resultante**:

```sql
create or replace function public.status_tem_detentor(p public.status_ativo)
returns boolean language sql immutable set search_path = public as $$
  select p in ('em_uso', 'emprestado', 'reservado');
$$;
```

E, dentro dos `case`, **o ramo novo vem primeiro** — é a ordem que faz a regra funcionar:

```sql
colaborador_atual = case
  when not public.status_tem_detentor(v_novo)        then null
  when new.tipo in ('saida','emprestimo','reserva')  then new.colaborador
  else colaborador_atual end,
```

O ramo novo **absorve inteira** a lista de seis (todos aqueles tipos resultam em estados sem dono) e
ainda fecha os cinco que nenhuma lista de tipos cobria. `saida`/`emprestimo`/`reserva` resultam nos
três estados COM dono, então caem no segundo ramo e seguem gravando o payload — é o que faz a
re-reserva da F34 continuar trocando o detentor.

## 3. O que NÃO mudou (e foi conferido, não presumido)

- **`status_apos_movimentacao` ficou byte a byte.** md5 do `pg_get_functiondef` antes e depois do
  ensaio: `69a73abfcfe13d7b2560bb6908c09a72` nos dois. Nenhuma transição nasce, morre ou muda de
  destino — a F36 mexe no que a movimentação **grava**, nunca no que ela **permite**.
  `src/lib/validators/transicoes-sql.test.ts` continua lendo a `0109`, e é isso mesmo.
- **O ramo do `estorno` ficou byte a byte** (decisão D2). Ele retorna antes do `update` e continua
  restaurando o `snapshot_anterior` inteiro. Provado por roteiro: cenário g2 do `f36_detentor.sql`.
- **`transferencia` preserva o dono** (ela mantém o estado). Cenário f1.
- **A pendência de item da devolução** (F18) continua nascendo. Cenário h3.
- **Os relatórios congelados** (`relatorios_gerados`) não são tocados: são retratos em JSON.
- **Zero dependência nova. Zero mudança de UI de operação.**

## 4. O diff, conferido byte a byte contra o corpo VIGENTE do banco

A base de cada `create or replace` foi o corpo lido do banco por `pg_get_functiondef` em 28/08/2026
— **não** o arquivo de uma migration antiga (a lição da `0047`, repetida na `0109`). Depois de
aplicar a `0110` numa transação desfeita, o `pg_get_functiondef` foi lido de novo e comparado com o
retrato anterior. O diff completo, em quatro funções:

| Função | md5 anterior | Diff |
|---|---|---|
| `aplicar_movimentacao` | `53dbb8c0c189e20b83411c86976bfc28` | 2 linhas novas (uma por `case`), 2 linhas removidas (a lista de seis) |
| `rel_estoque_asof` | `b98dbb8b3022b8e43cfd395b53c9ada1` | as duas listas viram a pergunta; `u.tipo is null` sobe para primeiro ramo |
| `forcar_estado_ativo` | `27b64765a043f9d32fd3846ed5fac4ea` | o array constante sai; a pergunta entra nas 3 ocorrências |
| `dev_checagens_integridade` | `021e363b953d3034db0cd18937a1a59b` | 1 `return query` novo, ao fim; as nove anteriores intactas |

Nenhuma outra diferença. **Assinaturas idênticas** (`create or replace` puro → sem overload), e o
`create or replace` **não reseta grants**: o `revoke` da `0038` sobre `aplicar_movimentacao` e o da
`0087` sobre `dev_checagens_integridade` continuam valendo — conferido pelo roteiro
`seguranca_catalogo.sql`, que passa com as migrations aplicadas.

## 5. As contagens de produção

### 5.1 O passado sujo, antes do backfill

| status | ativos | com colaborador | com setor |
|---|---:|---:|---:|
| `em_estoque` | **4** | 2 | 3 |
| *(qualquer outro)* | 0 | 0 | 0 |

A varredura foi por `status not in ('em_uso','emprestado','reservado')` — a regra nova —, não por
uma lista de estados. Nenhum outro estado apareceu.

### 5.2 O dry-run da `0110` + `0111` contra a produção real, em `begin; … rollback;`

| medida | antes | depois | Δ |
|---|---:|---:|---:|
| ativos com detentor em estado sem dono | **4** | **0** | −4 |
| total de ativos | 1.616 | 1.616 | 0 |
| `em_uso` | 1.320 | 1.320 | 0 |
| `emprestado` | 3 | 3 | 0 |
| `reservado` | 54 | 54 | 0 |
| `em_estoque` | 116 | 116 | 0 |
| total de movimentações | 3.429 | 3.429 | 0 |

**Nenhum ativo mudou de estado e nenhuma movimentação nasceu** — que é exatamente o que a decisão D3
pede (limpeza silenciosa, sem inventar histórico).

### 5.3 O efeito RETROATIVO no as-of, contado antes de aplicar

| tipo | status resultante | movimentações | período |
|---|---|---:|---|
| `ajuste` | `em_estoque` | **21** | 27/07/2026 → 27/08/2026 |

São as movimentações que, quando são "a última efetiva" numa data escolhida, passam a devolver
colaborador/setor **nulos** no relatório daquela data. É a correção — e o §3.3 do plano exigia que
fosse contada antes e dita em voz alta. Na leitura de **hoje**, 4 ativos mudam.

## 6. As provas executáveis

### 6.1 O roteiro novo — `supabase/tests/f36_detentor.sql`

11 cenários, todos ✓ contra a produção real em transação desfeita:

| cenário | o que prova |
|---|---|
| a1 / a2 | `status_tem_detentor` é verdadeiro em **exatamente** três estados — varredura sobre `enum_range`, não sobre lista escrita à mão |
| b1 | **o furo principal**: `ajuste` para `em_estoque` ZERA colaborador e setor |
| c1 | **o par positivo**: `ajuste` para estado COM dono PRESERVA — sem ele, uma implementação que zerasse sempre passaria em b1 |
| d1 | `retorno_manutencao` limpa detentor legado |
| e1 | `marcar_defasado` idem — o estado que a lista da `0084` esquecia |
| f1 | `transferencia` de ativo `em_uso` preserva o dono e só muda a filial |
| g1 / g2 | `estorno` DEVOLVE colaborador e setor (D2) |
| h1 / h2 / h3 | regressão do dia a dia: reserva e empréstimo gravam; devolução zera **e** abre a pendência de item |
| i1 / i2 | o espelho as-of: hoje concorda com o ao vivo; numa data anterior ao ajuste, o período continua contado como foi |
| j1 / j2 / j3 | a décima checagem enxerga a sujeira plantada à mão e volta ao número original — comparação por **delta**, não por número absoluto |
| k1 | `forcar_estado_ativo` para `defasado` zera e reporta `detentor_zerado = true` |

**O roteiro não é vacuoso:** rodado SEM as migrations, ele falha na primeira linha
(`function public.status_tem_detentor(status_ativo) does not exist`).

### 6.2 Os roteiros existentes — treze rodados, dois trocaram de lado

Cada roteiro foi rodado **com e sem** as migrations, contra a produção real em transação desfeita
(os `raise warning '✗'` convertidos em exceção, para a falha voltar pela API).

| roteiro | sem F36 | com F36 |
|---|---|---|
| `maquina_estados.sql` | ✓ | ✓ |
| `asof_desempate.sql` | ✓ | ✓ |
| `pendencias_item.sql` | ✓ | ✓ |
| `pendencias_import_termo.sql` | ✓ | ✓ |
| `reabrir_pendencia_item.sql` | ✓ | ✓ |
| `seguranca_catalogo.sql` | ✓ | ✓ |
| `transicoes_extra.sql` | ✓ | ✓ |
| `dominios_login.sql` | ✓ | ✓ |
| `itens_extra.sql` / `itens_quantidade.sql` | ✓ | ✓ |
| `transferencia_item.sql` | ✓ | ✓ |
| `papeis_rls.sql` | ✓ | ✓ |
| `cargo_dev.sql` | ✓ | ✓ |
| `f34_triagem_reserva.sql` | ✓ | **✗ j1** → corrigido |
| `manutencao_fornecedor.sql` | ✓ | **✗ 7a** → corrigido |

**As duas falhas eram a mudança funcionando.** j1 afirmava "o ajuste deixa o ativo `em_estoque`
AINDA com detentor" e 7a afirmava "o ajuste preserva o detentor" — as duas frases descreviam o furo.
Foram **invertidas, não apagadas**: agora afirmam que o ajuste ZERA, e a precondição do cenário
seguinte (7b e j2, que provam outra coisa) passou a ser plantada com um `update` direto em `ativos`,
porque depois da `0110` **nenhum caminho de escrita produz** um ativo em estado sem dono com
detentor — ele só existe como dado legado.

### 6.3 A guarda TS↔SQL nova

`src/lib/validators/detentor-sql.test.ts` lê a migration vigente que **define**
`status_tem_detentor` (âncora no `create or replace`, não no nome — `comment on`, `revoke` e `grant`
também citam a função) e compara com `STATUS_COM_DETENTOR` em `dominio.ts`. Molde de
`transicoes-sql.test.ts` (item D da dívida) e `marcadores-sql.test.ts` (item H). 13 asserções.

### 6.4 Portões

| portão | resultado |
|---|---|
| `npm run lint` | limpo |
| `npm run test` | **2.609** testes, 128 arquivos, 0 falha (eram 2.544 na F35) |
| `npm run build` | limpo |
| roteiros SQL | ver §6.2; o job `banco` do CI é a prova final, num Postgres novo |

## 7. A trava que impede a volta

A décima checagem de integridade do `/dev`:

```
detentor_em_estado_sem_dono → ativos em estado sem dono que ainda carregam colaborador ou setor
```

Em operação normal ela é **sempre zero**. A entrada curada entrou em `CHECAGENS`
(`src/lib/queries/dev.ts`) **no mesmo commit** da migration — a rede permanente de
`juntarCatalogoComResultados` garante que uma checagem nova **apareça**, não que apareça legível.

**Dois caminhos podem legitimamente fazê-la subir, e os dois estão nomeados na tela e na migration:**
`estorno` e "Apagar movimentação" restauram o `snapshot_anterior` inteiro — de propósito (D2) —, e um
retrato tirado antes da `0111` pode carregar detentor num estado sem dono. É o preço de "desfazer
desfaz de verdade"; a checagem existe justamente para isso aparecer em vez de mentir no relatório.

## 8. O que este relatório NÃO prova

- **Não houve ensaio no projeto de ensaio.** Ele está `INACTIVE` (pausa por inatividade) e a chamada
  de `restore` foi recusada pelo classificador do modo automático; não há Docker nesta máquina para
  `supabase start`. O ensaio foi feito contra a **produção em transação desfeita** — mais fiel ao
  dado real, mas sem a folga de um ambiente descartável. Ata em `docs/DECISOES.md`.
- **`dev_destrutivo.sql` e `import_substituir.sql` não foram rodados** nesta sessão: o primeiro faz
  reset global do acervo (travaria as tabelas de produção pela duração da transação) e o segundo
  chama a RPC destrutiva do import. Os dois foram cobertos por **leitura estática** — o único ponto
  em `dev_destrutivo.sql` que a F36 alcança são os cenários 9c e 9f, e os dois continuam válidos
  (9c força `descartado`, 9f força `emprestado`; nenhum dos dois muda de lado). Os **comentários**
  daqueles cenários foram atualizados, porque descreviam a regra antiga. A prova executável fica com
  o job `banco` do CI.
- **Dois roteiros falham em produção por artefato de ambiente**, idêntico com e sem a F36:
  `conflito_filiais.sql` (espera 4 grupos de conflito; o acervo real tem 76) e `troca.sql` (rebaixa a
  `admin` o primeiro `profile` que encontra, e em produção esse perfil é um `dev`). Nenhum tem
  relação com a F36.
- **Nenhum teste de componente** — o item Y da `docs/DIVIDA-TECNICA.md` continua aberto. A F36 não
  mexeu em componente nenhum, então a lacuna não cresceu, mas também não diminuiu.
- **Não há medição de desempenho.** `status_tem_detentor` é `immutable` e não lê tabela; o custo é
  de uma chamada de função por linha em `rel_estoque_asof`. Não foi medido, e não foi prometido.

## 9. Escopo — o que entrou além do plano, e por quê

O §3 do plano listava três funções. Entraram **cinco**:

1. `status_tem_detentor` — nova, o vocabulário.
2. `aplicar_movimentacao` — prevista.
3. `rel_estoque_asof` — prevista.
4. **`forcar_estado_ativo`** — **não prevista**. A `0084` tem a sua própria lista de estados sem dono
   e deixava `defasado` de fora de propósito; a decisão D1 revoga essa premissa. Sem recriá-la, o
   sistema teria um caminho de escrita **oficial** capaz de fazer a décima checagem subir por
   operação normal — uma trava que acusa o próprio sistema não é trava, é ruído. Ata registrada.
5. `dev_checagens_integridade` — pedida pelo §3.5 do plano (a décima checagem), embora a tabela do
   §7 falasse em "3 funções".

Fora do banco, entrou também uma **nota na página de ajuda "Corrigir o que ficou errado"**: a
mudança é visível para quem opera (ajustar para a prateleira limpa o responsável), e a ajuda é o
manual do operador neste repositório.

## 10. Rollout

| passo | o quê |
|---|---|
| 1 | Backup JSON das 4 linhas afetadas, fora do repositório (contêm nome real) |
| 2 | Dry-run da `0110` + `0111` contra produção em `begin; … rollback;` — contagens do §5.2 |
| 3 | Ensaio dos treze roteiros, com e sem as migrations |
| 4 | `0110` aplicada em produção (nenhum dado tocado) |
| 5 | `0111` aplicada em produção (4 linhas) |
| 6 | Contagens depois: sujos = 0, ativos por status inalterados |
| 7 | Commit + tag `v1.41.0` + push (o deploy sai pela Vercel) |

A ordem `0110` → `0111` importa: a `0111` usa `status_tem_detentor`.
A ordem **migration antes do deploy** também: o código novo (`STATUS_COM_DETENTOR`, a décima
checagem no catálogo) só faz sentido com a função no ar.

## 11. Backlog que a fase deixou nomeado

- **F37 → F39** seguem como no `docs/PLAN-F36-F39.md` (cadastro de colaboradores e tipos de item; os
  itens andando com o ativo; o termo listando o que foi junto). A F36 era a única independente.
- **Item W da `docs/DIVIDA-TECNICA.md` continua aberto:** `current_date` cru dentro de RPC (bug de
  fuso). A linha existe em `forcar_estado_ativo`, e foi **deixada como está de propósito** — trocá-la
  aqui seria mudança fora do diff pretendido.
- **`apagar_movimentacao` e `estorno` podem reintroduzir detentor legado** ao restaurar um retrato
  antigo. É por desenho (D2) e está nomeado na migration, no catálogo da checagem e aqui.
