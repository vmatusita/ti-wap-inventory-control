# PLAN-F41 — o motor: o item para de bloquear e passa a falar a língua do ativo

**Escrito em 31/08/2026**, antes da primeira linha de código, a partir de
[`PLANO-ITENS.md`](PLANO-ITENS.md) §5 e da ordem `docs/prompts/F41-motor-itens-ultracode.md`.
Este documento é **autossuficiente**: sobrevive à compactação do contexto e é o gabarito da revisão
adversarial. Onde ele e o plano de área divergirem, vale este — e a divergência vira ata em
[`DECISOES.md`](DECISOES.md).

> **Objetivo declarado.** Ao fim da F41: marcar **"Voltou"** no checklist de uma devolução **nunca**
> derruba o lote; o operador cadastra item no meio do fluxo; e nenhuma tela oferece dois nomes para a
> mesma coisa. **O redesenho de `/itens` é a F42 e não entra aqui.**

---

## 0. A linha de base, medida antes de mudar (31/08/2026)

| Comando | Resultado |
|---|---|
| `npm run lint` | verde (sem saída) |
| `npm run test` | verde — **142** arquivos, **3233** testes |
| `npm run contraste` | verde (o único ❌ da tabela é o "antes" registrado da F40, esperado) |
| `npm run build` | verde |

**Contagens de §9 revalidadas em produção (`pbtjcalbmepmrqzprusb`), só-leitura:** 12 das 13 batem.
A única divergência é `movimentacoes` = **3432** (o plano diz 3431): produção andou +1 desde a
redação. Não é erro de fórmula — é o documento que envelheceu.

Duas descobertas que mudam o texto do plano de área e entram como ata:

1. **`rel_saldo_itens` não existe.** Não há view de saldo a reusar: toda leitura agrega
   `lancamentos_item` na mão. As fórmulas canônicas são as do trigger `valida_lancamento_item`
   (§2 abaixo).
2. **`resolver_pendencias_item_com_lancamentos` diverge entre ensaio e produção** — 47 bytes, e a
   diferença é **um comentário** (`(idempotência: reenviar não re-resolve…)` em produção contra
   `(ver "IDEMPOTÊNCIA")` em ensaio). A lógica é byte a byte idêntica. A recriação da `0126`
   **converge os dois**.
3. **Zero colisão** entre os 22 itens do catálogo sob a chave nova — o índice único entra limpo.

---

## 1. Os corpos de partida, lidos do BANCO (não de migration antiga)

Lidos por `pg_get_functiondef` em produção, 31/08/2026. **É deles que partem as recriações** — a
lição da `0047`, repetida na `0109` e na `0118`. A linhagem real, conferida no repositório, é
`criar_movimentacao_com_itens`: `0117` → `0123` (o plano de área diz "0117 → 0121" e está errado);
`resolver_pendencias_item_com_lancamentos`: só a `0119` (o plano diz "0119/0122", também errado).

| Função | Assinatura (exatamente 1, sem sobrecarga) | `md5` do corpo | Tamanho |
|---|---|---|---|
| `criar_movimentacao_com_itens` | `(jsonb, jsonb, uuid)` | `2d9bf5f23860635be0fbdd43a034dfeb` | 8338 |
| `resolver_pendencias_item_com_lancamentos` | `(uuid[], text, text, jsonb, uuid)` | `e5c0240a349a5380f224129e30a14481` (prod) · `8f8fc10188d5b85fb6a03793e062cfd1` (ensaio) | 4422 / 4375 |
| `estornar_movimentacao_com_itens` | `(uuid, text, jsonb, uuid)` | `1fe7895feb14d6dbb5942c13dcc33cf7` | 3451 |
| `valida_lancamento_item` | `()` (trigger) | `77b7b39491f03d7171e7751720340e73` | 4123 |
| `dev_checagens_integridade` | `()` | `c12806bdab1cfab9bac537d17b39d6af` | 3955 |
| `colaborador_chave` | `(text)` | `5dda3c60cf3a13fc4b459bd8f273e955` | 383 |

**O que NÃO pode sair da recriação** (checklist da revisão byte a byte):

- as **duas classes de trava** e a ordem entre elas — ativos (`for update`) primeiro, advisory
  `pg_advisory_xact_lock(item, filial)` depois;
- a **filial derivada do ativo lido SOB a trava** (`v_ativo.filial_id`);
- o bloco `exception when others` que **etiqueta a linha culpada** e **re-lança o erro original**
  (`detail = 'f38_linha=' || v_i` / `'f38_item=' || v_i`);
- o `security invoker` (declarado por ausência de `security definer`) e o `set search_path = public`;
- a **ordem total de inserção por efeito** do passo 5 e o guard
  `jsonb_typeof(e.value -> 'quantidade') = 'number'` que a `0123` introduziu;
- o teto do lote (`k_teto_lote = 30`), a validação de `indice_movimentacao` e a guarda
  `pode_escrever_filial` pela mensagem.

---

## 2. As fórmulas canônicas (do trigger `valida_lancamento_item`, que NÃO muda)

Para o par `(item_id, filial_id)`:

```
total_raw = Σ entrada + Σ ajuste
lib_raw   = Σ saida  − Σ retorno                    -- "em uso" (pode ser negativo)
atrelados = Σ_por_chamado máx(0, Σreserva − Σliberacao)   -- só linhas com chamado
estoque   = total_raw − atrelados − máx(0, lib_raw)
```

As CINCO guardas do trigger, todas mantidas de pé:
`total_raw ≥ 0` · `estoque ≥ 0` · `liberacao ≤ reserva em aberto do chamado` ·
`retorno ≤ lib_raw` (e, quando a linha nomeia pessoa, `retorno ≤ o registrado com ela`).

Daí saem os dois números que a partição lê:

- **`A` = em uso em aberto** = `greatest(0, lib_raw)` — o teto do `retorno`.
- **`E` = em estoque** = a fórmula de `estoque` acima — o teto da `saida`.

---

## 3. A regra única da fase (§4.2 do plano de área)

> **O sistema nunca recusa um lançamento de item por falta de saldo dentro de uma movimentação de
> ativo.** Ele parte a quantidade em duas: a parte que o diário já conhecia vira o lançamento
> normal; a parte que ele não conhecia vira um **acerto de contagem com justificativa automática**,
> marcado `regularizacao`.

| Caminho | Lê | Grava, nesta ordem |
|---|---|---|
| **Devolução** de `q` (checklist "Voltou" · "Item recuperado") | `A` | `ajuste +(q − mín(q,A))` **se > 0**, depois `retorno mín(q,A)` **se > 0** |
| **Entrega** de `q` ("Itens que vão junto") | `E` | `ajuste +máx(0, q − E)` **se > 0**, depois `saida q` |
| **Lançamento avulso** (`lancar_itens_lote`) | idem | **idem — a regra é a mesma nos dois caminhos** |

**Onde a conta é feita: no Postgres, dentro da RPC, DEPOIS das travas.** Nunca na action — entre ler
o saldo no servidor e gravar, outra sessão pode mexer no mesmo par, a partição sairia errada, o
trigger recusaria e o lote morreria de novo, pelo mesmo motivo que estamos consertando.

**A leitura é incremental.** O saldo é relido **fresco a cada linha**, dentro do laço: os INSERTs já
feitos na mesma transação são visíveis. Sem isso, duas linhas do mesmo par contra `A = 1` planejariam
`retorno 1` cada uma e o trigger recusaria a segunda.

**A observação chega pronta da aplicação** (função pura `src/lib/itens/regularizacao.ts`), porque a
RPC desta casa **não redige texto** (regra do cabeçalho da `0117`) e o `CHECK`
`lanc_item_ajuste_obs` exige justificativa em todo ajuste. Se a regularização for necessária e o
texto vier vazio, a RPC recusa com mensagem clara — e a action **sempre** o envia.

**Por que nenhuma guarda é afrouxada.** Em nenhum passo o estoque fica negativo, o total fica
negativo ou o "em uso" passa do que saiu. A aplicação passa a **escolher entre gravações que o banco
já aceita** — exatamente o que `vinculo-retorno.ts` já faz com o vínculo da pessoa.

---

## 4. Frente A — banco (3 migrations, rollback no rodapé de cada uma)

### `0125_item_chave_e_regularizacao.sql`
1. `public.item_chave(text)` — **espelho char a char** de `colaborador_chave`: `language sql`,
   `immutable strict`, `set search_path = public`, `normalize(NFC)` → `translate(acentos)` →
   `regexp_replace('[ \t\n\r\f\v]+', ' ', 'g')` → `btrim` → `lower`. `grant execute` a
   `authenticated, service_role`; `revoke` de `public, anon`.
2. `itens.nome_chave text generated always as (public.item_chave(nome)) stored`.
3. `create unique index itens_nome_chave_uidx on public.itens (nome_chave)` — **mecanismo de
   deduplicação, não otimização**.
4. `itens.criado_por uuid references public.profiles(id)` — **anulável** (≠ `colaboradores`, que
   nasceu `not null` porque a tabela era nova; aqui há 22 linhas históricas sem autor). Ata.
5. Policy de INSERT de `itens`: `drop policy "admin insere"` → `create policy "escrita cria item"
   … with check ((select public.pode_escrever()))`. UPDATE e DELETE seguem `e_admin()`.
6. `lancamentos_item.regularizacao boolean not null default false` + `comment on column`.

### `0126_lancamento_regulariza.sql`
Recria, a partir do corpo lido do banco (md5 no cabeçalho), **mudando só a partição**:

- **`criar_movimentacao_com_itens(jsonb, jsonb, uuid)`** — assinatura **idêntica** (o payload de
  itens é `jsonb` e comporta a chave nova `observacao_regularizacao` sem parâmetro novo; mudar a
  lista de argumentos criaria **sobrecarga**, que o `RUNBOOK-BANCO.md` proíbe). Dentro do laço do
  passo 5, para `tipo in ('retorno','saida')`, lê o saldo fresco, insere o `ajuste` de regularização
  e então a linha original com a quantidade ajustada. Os demais tipos seguem o caminho de hoje.
- **`resolver_pendencias_item_com_lancamentos(uuid[], text, text, jsonb, uuid)`** — assinatura
  idêntica; a ordem dentro do elemento passa a ser `ajuste +reg` → `retorno mín(q,A)` → (baixa)
  `ajuste −q`.
- **`lancar_itens_lote(jsonb, uuid)` — nova**, `security invoker`, o avulso transacional que hoje é
  um `for` de INSERTs (item da `DIVIDA-TECNICA.md`). Nasce **com a mesma partição**, porque a §4.2 é
  explícita: *"a regra é a mesma nos dois caminhos, senão nascem dois comportamentos"*.

`notify pgrst, 'reload schema';` ao final (RPC nova).

### `0127_conversao_reservas.sql`
- Conversão **única e só-INSERT** das 5 reservas abertas: por grupo `(item, filial, chamado)`,
  `liberacao q` e depois `saida q`, carregando `chamado`, o `colaborador` quando houver e o
  `criado_por` **da própria reserva**. **Efeito no estoque: zero** (a `liberacao` sobe o disponível
  em `q` ao zerar `atrelados`; a `saida` o desce em `q`).
- **A décima primeira checagem** `reserva_aberta` em `dev_checagens_integridade` (hoje são **DEZ** —
  a `0110` acrescentou `detentor_em_estado_sem_dono`). SQL **fixo** dentro da função; função que
  receba SQL como parâmetro segue proibida.

**Irreversível por construção**, e o Johnny aprovou sabendo (decisão J6): só-INSERT, e o
`guarda_acervo` proíbe apagar lançamento.

---

## 5. Frente B — funções puras (`src/lib/itens/` + `src/lib/dominio.ts`)

| Arquivo | O que entrega |
|---|---|
| `itens/chave.ts` | `ACENTOS_DE`/`ACENTOS_PARA`/`ESPACOS_DA_CHAVE`, `chaveItem(nome)`, `chavesDistintas` — espelho char a char do SQL, com `aparar()` manual (não `.trim()`) |
| `itens/chave-sql.test.ts` | A guarda TS↔SQL, **no molde exato** de `colaboradores/chave-sql.test.ts`: lê a migration vigente do disco pela âncora `create or replace function public.item_chave`, extrai por regex os dois literais do `translate(…)` e a classe de espaço, compara string a string com as constantes TS, e roda um corpus `it.each` de pares conferidos contra o Postgres |
| `itens/regularizacao.ts` | `partirQuantidade({ tipo, quantidade, emUso, emEstoque })` → `{ normal, regularizacao }` (a mesma conta da RPC, para a tela **prever**) e os **textos prontos** da observação |
| `itens/estorno.ts` | `planejarEstorno` passa a reconhecer o ajuste de regularização e a redigir o inverso com o texto próprio |
| `itens/escolha-tipo.ts` | **4 grupos, sem a segunda pergunta** — Compra · Saída · Devolução · Ajuste |
| `dominio.ts` | `TIPO_LANCAMENTO_META` com os rótulos novos; `TIPO_LANC_PILL` com **a mesma tinta** do tipo correspondente do ativo |

### O vocabulário-alvo (§4.1 — sem interpretação)

| Enum (**imutável**) | Rótulo hoje | **Rótulo novo** | Tinta hoje | **Tinta nova** (a do ativo) |
|---|---|---|---|---|
| `entrada` | Entrada | **Compra** | `selo-em-uso` | `selo-em-estoque` (= ativo `compra`) |
| `saida` | Liberação | **Saída** | `selo-em-manutencao` | *(já casa com ativo `saida`)* |
| `retorno` | Retorno | **Devolução** | `selo-troca` | `selo-em-uso` (= ativo `devolucao`) |
| `ajuste` | Ajuste | **Ajuste** | neutra | *(já casa)* |
| `reserva` | Atrelar | **Reserva** — só histórico | `selo-reservado` | *(mantém; o ativo `reserva` não tem tinta própria)* |
| `liberacao` | Devolução | **Devolução de reserva** — só histórico | `selo-em-estoque` | *(mantém)* |

E o número `Atrelados` passa a chamar-se **Reservado**. **Os valores do enum e os nomes das colunas
SQL (`total`, `estoque`, `atrelados`) não mudam.**

---

## 6. Frente C — actions e fluxo

- `actions/movimentacoes.ts` · `montarItensJunto`: acrescenta `observacao_regularizacao` ao payload
  (a linha crua continua igual); a decisão de partir é do banco.
- `actions/itens.ts`: `criarItemInline` troca `exigirAdmin` por `exigirPapel(…, 'operador')` e passa
  a aceitar `tipo_id`; `lancarItens` passa a chamar `lancar_itens_lote`.
- `actions/pendencias.ts`: "Item recuperado" ganha a `observacao_regularizacao`.
- `components/movimentacoes/nova/campo-item.tsx` (novo): o campo de item com **"Cadastrar"**, no
  padrão do `campo-colaborador`. Item criado a partir de uma linha do checklist **nasce com o
  `tipo_id` daquela linha**.
- O painel de sucesso e o toast dizem, em **uma linha**, o que foi regularizado.
- `queries/dev.ts`: o catálogo curado ganha a 11ª entrada (`TOTAL_CHECAGENS` passa de 10 a 11).
- As superfícies de rótulo do critério 10: `relatorios/tabela-itens-grupo.tsx`,
  `corpo-relatorio-v2.tsx`, `actions/exportar.ts`. **Legenda é render, não dado** (precedente F17):
  nenhuma contagem muda.

---

## 7. Frente D — texto, documentação e versão

`ajuda/conteudo/{itens-por-quantidade,lancar-itens,mensagens-de-erro}.ts` · `actions/erros.ts` ·
`ESPECIFICACAO.md` · `MATRIZ-REGRAS.md` · `ARQUITETURA.md` §10 · `DECISOES.md` ·
`DIVIDA-TECNICA.md` · `README.md` · `CHANGELOG.md` — **e mais dois que esta fase torna falsos**:
`ADR-002-papeis-e-permissoes.md` e o parágrafo do modelo de acesso do `CLAUDE.md`, que hoje afirmam
que `colaboradores` é o **único** cadastro em que o operador insere. **A partir da F41 são dois.**

⚠ **Os dois testes que quebram sozinhos** ao mudar rótulo (o plano de área erra o motivo):
`ajuda/conteudo/referencia.test.ts` (strings literais `'o que sai por Liberação volta por Retorno'`,
`'o que sai por Atrelar volta por Devolução'` e o array `MENSAGENS_OBRIGATORIAS`) e `gestao.test.ts`
(nomes de teste e comentários). **A sincronia ajuda↔`erros.ts` é MANUAL** — nenhum teste importa
`erros.ts`; é responsabilidade do mesmo commit.

**Roteiros SQL:** cenários novos em `f38_itens_com_ativo.sql`; roteiro novo `f41_regularizacao.sql`;
e — obrigatório — o cenário **3c** de `papeis_rls.sql`, que afirma "operador recusado ao criar item"
e fica **vermelho no job `banco`** no instante em que a policy vira `pode_escrever()`. Inverte-se no
molde do `3c-ter`, **com ata**: é o teste que muda porque a REGRA mudou.

**Versão `1.46.0`** (é fase → MINOR): `package.json`, topo de `versoes/registry.ts` em linguagem de
operador, `CHANGELOG.md`, tag anotada `v1.46.0` publicada.

---

## 8. Fora de escopo — declarado

- **O redesenho de `/itens` (F42 inteira).** `app/(app)/itens/page.tsx` e `components/itens/**` só
  mudam no que **rótulo** e **chamada da RPC nova** exigirem. Nada de casco da F40, nada de tabela
  única, nada de `/itens/historico`, nada de encolher o diálogo de 876 linhas.
- **`valida_lancamento_item`** — as CINCO guardas ficam de pé, **inclusive a que gerou o print**.
  Se a implementação precisar afrouxar o trigger, ela está errada.
- **Os valores do enum `tipo_lancamento`** e **os nomes das colunas SQL**.
- `/ativos`, o wizard além da seção de itens, `components/ui/`, `types/database.ts` (só por
  `npm run db:types`), dependência nova, `.env*`, dado real, `db:seed`/`db:reset`/`carga`.
- Os outros documentos sem versionar de `docs/` (outras frentes). **Nunca `git add -A`.**

---

## 9. Verificação de ponta a ponta

1. `lint` + `test` + `contraste` + `build` verdes **após cada incremento** (são os QUATRO do job
   `verificar`, não três).
2. **TODOS** os roteiros de `supabase/tests/*.sql` no **ensaio** — não só o novo. Foi esse o furo da
   F15. Por `execute_sql` em `begin; … rollback;` que devolve **LINHAS**: o MCP engole `NOTICE` e
   `WARNING`, então nunca concluir "passou" por ausência de aviso.
3. Pós-apply: `get_advisors`, assinatura por `p.oid::regprocedure` (**exatamente 1 linha**), grants
   (`authenticated=true`, `anon=false`, `service_role=false`), contagens antes = depois.
4. Ensaio ponta a ponta dos critérios 1–5 e 12, com dados **fictícios**.
5. Produção: backup para `scratchpad/` antes, `0125`+`0126`, verificar, `0127`, contagem por
   contagem, `notify pgrst`.
6. Merge → push → tag → deploy → `node scripts/smoke/smoke-prod.mjs` → as **onze** checagens de
   `/dev`, com `reserva_aberta` em zero.
7. Os **dois** jobs do CI verdes (`verificar` e `banco`).

## 10. Os 12 critérios de aceite

Os 11 do §5 do plano de área, mais o 12º que a §4.2 exige e o checklist de lá não listou: **o
lançamento avulso regulariza igual ao checklist** — pela tela de itens, a devolução de um item sem
saída em aberto grava o mesmo par que o checklist grava.
