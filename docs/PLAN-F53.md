# PLAN-F53 — ordem total da tabela `movimentacoes`

> Plano de execução da F53. Escrito **antes** da implementação, com as contagens reais medidas
> contra **produção** (`pbtjcalbmepmrqzprusb`) e **ensaio** (`sgmvldiizsrjbxzzpmhh`) em 09/09/2026.
> Fonte da ordem: `docs/prompts/F53-ordem-das-movimentacoes-ultracode.md`.
>
> ⚠ **Este arquivo é o plano PRÉ-implementação e foi deixado como estava escrito** — ele é o
> registro do que se sabia antes de executar, e reescrevê-lo apagaria justamente a informação
> de onde a execução divergiu. O que a implementação mudou está em
> **[`RELATORIO-F53.md`](RELATORIO-F53.md)**, §6. Em resumo, três coisas: (a) nasceu uma
> **`0135`** (o índice `(data desc, ordem desc)`) que o plano não previa, porque a medição de
> plano acusou regressão; (b) o roteiro foi de 4 para **18** asserções, e não para as 14 que a §4
> lista — `4c`, `4d` e `7b` nasceram das **sabotagens**, que encontraram o roteiro cego; (c) a
> mutação da trava do estorno aponta `4c`, não `4a`, porque `4a` não discrimina as réguas.

## 0. As medições de partida (e onde elas divergem da ordem)

| O que | Medido | O que a ordem/ficha dizia | Veredito |
|---|---|---|---|
| Última migration no disco | `0132` | `0132` | confere → as novas são **0133** e **0134** |
| Linhas de `movimentacoes` (prod) | **3497** (1620 ativos) | — | — |
| Span do acervo (prod) | **2024-01-08 → 2026-09-08** | "os 13 meses" | **20 meses**, não 13 |
| Linhas com `data < created_at::date` (prod) | **2227 de 3497 (63,7%)**, atraso máx. **935 dias** | não medido | retroatividade é **rotina**, não exceção |
| Índices de `movimentacoes` | **11** | "os NOVE índices" | **11**, não 9 |
| Gatilhos vivos | **2**: `movimentacoes_guarda_acervo` (INS/UPD/DEL), `trg_aplicar_movimentacao` (**BEFORE INSERT apenas**) | — | o backfill **não** re-executa a máquina de estados |
| Fila pendente de apply | **`0131` e `0132`** (0129 e 0130 **já aplicadas**) | "a fila `0129`→`0132`" | **duas**, não quatro |
| Ensaio | **VIVO** e alcançável; as 4 funções que a fase toca têm fingerprint **idêntico** ao de produção | "ele esteve INACTIVE nas F36/F37/F50" | ensaio-primeiro **é possível** |
| `status_apos_movimentacao` | não ordena nada; corpo vigente é a **0109**, não a 0047 | "0047:19" | confirma o não-tocar; a linha diverge |
| `estornar_movimentacao_com_itens` | ordena só o payload/`lancamentos_item`; corpo vigente **0122** | "0122" | confere |
| `v_conflitos_filiais.ultima_mov_tipo` | **`0096:76-80`**, não 0092 | "0092:170-174" | a linha diverge |
| Mutações | **55 ativas**, 2 em quarentena, teto **56** | — | folga de **1** → o teto sobe |
| Roteiros de `supabase/tests/` | **31 arquivos, 633 sítios de asserção** | — | `asof_desempate.sql` tem **4** |
| `movimentacoes` em publication | **sim**, `supabase_realtime`; **zero replication slots ativos** | não medido | UPDATE emite WAL, **ninguém consome** |
| Tamanho da tabela | 2848 kB (1128 tabela + 1680 índices); `explain update` = Seq Scan custo 176 | — | backfill é trivial |

Como as duas primeiras foram confirmadas: `pode_ler_arquivo_termo` **existe** e `authenticated` tem
`execute` sobre ela (a `0129` e a `0130` estão no ar); `import_validar_plano`, `prefixo_backup_import`
e `mesmo_escopo_de_gestao` **não existem** (a `0131` e a `0132` não estão). Sonda de efeito, não ledger.

### A medição que decide a fase

Comparação das três réguas candidatas para "qual é a última movimentação do ativo", ativo a ativo,
sobre os **1620 ativos** de produção (`scratchpad/f53/reguas.sql`):

| Régua | Difere de hoje em | Dessas, com empate de `created_at` |
|---|---|---|
| **hoje** = `(created_at, id)` | — | — |
| **mista** = `(created_at, ordem)` | **643 ativos** | **643** — ou seja, **100%** |
| **pura** = `ordem` (data primeiro) | **653 ativos** | 643 + **10 sem empate** |

E, nos 643 que mudam sob a régua **mista**: a régua nova aponta o **`ajuste`** em **643 de 643**;
a régua de hoje apontava o `ajuste` em **0 de 643**. É a assinatura exata do cara-ou-coroa que a
`0054` descreveu ("~metade dos 1.002 ativos"): dos **1270** pares compra+ajuste empatados, o
`id desc` aleatório acertou o ajuste em ~627 e errou em 643.

**Leitura:** a régua **mista** muda a resposta **apenas onde a resposta de hoje é sorteio**, e a
troca sempre para o lado que `ativos.status` já considera verdade. A régua **pura** mudaria mais
10 ativos **sem empate nenhum** — casos em que ela escolheria uma linha que **não** é a última
gravada, cujo `snapshot_anterior` está velho. Esses 10 são exatamente o que **não** se pode mudar.

## 1. As dez decisões

**D1 — `generated always as identity`.** Medido: o schema tem **três** colunas identity
(`filiais.id`, `itens.id`, `tipos_item.id`), **todas `ALWAYS`**, e **zero** colunas com default
`nextval`. A casa não tem precedente de `by default` nem de sequência solta. Custo herdado pela
**F54**: toda restauração que reinsira linha com `ordem` explícita precisa de
`overriding system value` no INSERT (ou de um `alter column ordem set generated by default`
temporário). Está escrito aqui e na ata para que a F54 não descubra sozinha.

**D2 — a identidade entra DEPOIS do backfill, e a sequência é reposicionada por `setval`.**
Ordem: `add column` → backfill → `set not null` → `add generated always as identity` →
`setval(pg_get_serial_sequence(...), max(ordem))` → `create unique index`.
Duas armadilhas medidas: (i) `alter sequence … restart with` só aceita **literal** — por isso
`setval` com subconsulta; (ii) `setval(seq, N)` faz o próximo `nextval` devolver **N+1**, enquanto
`restart with N` devolve **N**. A ficha dizia "`setval` para `max+1`", o que deixaria um buraco de
um. **Usamos `setval(seq, max(ordem))`**, e o próximo INSERT recebe `max+1` — sem buraco. Provado
com um INSERT em `begin; … rollback;` depois de fechar a coluna.

**D3 — a régua nova: `data desc, ordem desc` para o negócio, `created_at desc, ordem desc` para o
registro.** Não é "uma régua só para tudo" — é **uma régua só por pergunta**, e cada uma com
`ordem` como desempate **exato**:

- *"o que valia nesta data?"* (as-of, lista de movimentações) → **`data desc, ordem desc`**.
  `data` continua sendo a primeira chave porque **63,7% do acervo é retroativo** e o operador pode
  lançar com data passada sem limite (`dataNaoFuturaSchema`, `validators/data.ts:26-30`). Sob
  `ordem desc` **puro**, uma movimentação retroativa **registrada amanhã** ganharia `ordem` maior e
  passaria a vencer o as-of de um período em que ela não era a verdade. Sobre o acervo de hoje as
  duas são idênticas (o backfill tem `data` como primeira componente) — a diferença é **inteiramente
  futura**, e é por isso que a comparação das 12 datas **não decide esta questão** (quem decide é o
  cenário `6a`).
- *"o que foi gravado por último?"* (linha do tempo da ficha, trava do estorno) →
  **`created_at desc, ordem desc`**. É a ordem em que a cadeia de `snapshot_anterior` foi construída,
  e desfazer fora dela restaura retrato velho.

E `(tipo = 'ajuste')` **sai** do desempate: `ordem` já o reproduz (é a terceira componente do
backfill, e para linha futura o ajuste é inserido depois, logo ganha `ordem` maior). Com asserção
(rótulo `3a`), não com fé.

**D4 — a trava do estorno passa a `(created_at, ordem)`.** Evidência acima: muda 643 ativos, **todos**
com empate, **todos** para o `ajuste`. A régua `ordem` pura mudaria mais 10 sem empate — recusada.
⚠ **Isto diverge do critério 6 da ordem**, que pede conjunto **idêntico**: o conjunto **não** é
idêntico, e não pode ser, porque em 643 ativos a resposta de hoje é um **sorteio de uuid** — um
conjunto que nem é estável entre execuções. A formulação honesta, que é o que este plano entrega:
*idêntico onde a resposta de hoje é determinada; diferente exatamente onde ela é indeterminada, e
sempre a favor do que `ativos.status` já diz.* Divergência declarada no relatório.

**D5 — a linha do tempo e a trava passam a usar a MESMA régua, que hoje NÃO usam.**
Hoje: linha do tempo = `created_at desc, data desc, id desc`; trava = `created_at desc, id desc`.
Elas divergem quando `created_at` empata e `data` difere — **178 pares** medidos. E
`components/ativos/linha-do-tempo.tsx:90` usa `movimentacoes[0].id` para decidir se mostra o botão
**Estornar**: a UI pode oferecer o botão numa linha que o banco recusa. Depois da fase as duas são
`created_at desc, ordem desc`, **a mesma pergunta**.

**D6 — as três leituras "qual foi a última" ganham `ordem` como segunda chave, e mantêm
`created_at` como primeira.** `:165` (`ultimoEnvioManutencao`), `:200`
(`ultimaMovimentacaoDoUsuario`) e `:268` (`ultimosAtivosMovimentadosDoOperador`) hoje **não têm
desempate nenhum** — `.order('created_at').limit(1)` e ponto. A `:200` é a de maior risco real:
o filtro é só por `criado_por`, então **todo lote** do operador grava N linhas com o mesmo
`created_at` e o "Repetir última" copia motivo/colaborador de um ativo **sorteado**. Nas três, a
pergunta é "qual foi a última ação do operador" = ordem de **gravação** → `created_at` primeiro.

**D7 — `v_conflitos_filiais.ultima_mov_tipo` entra nesta fase.** Medido: é a **única** régua de
"última movimentação" da base inteira **sem desempate nenhum** (`order by m2.data desc,
m2.created_at desc limit 1`, confirmado no `pg_get_viewdef` **vivo**), e **1448 ativos** têm empate
de `created_at`. Uma linha na 0134. A view não é recriada por nenhuma migration pendente
(a última que a recria é a `0096`), então não há conflito com a fila.

**D8 — os índices novos saem da medição, não da suposição.** `EXPLAIN ANALYZE` da lista e da linha
do tempo antes e depois. Hoje: lista servida por `movimentacoes_ordem_lista_idx`
(`data desc, created_at desc, id desc`, **15523** scans) e linha do tempo por `mov_ativo_idx`
(`ativo_id, data desc`, **144929** scans). Nenhum dos 11 cobre a chave nova. Se o plano regredir
para Sort/Seq Scan, os índices entram nesta fase, no molde da `0105`. **Nenhum índice existente é
dropado** (fora de escopo).

**D9 — a convenção do roteiro.** `asof_desempate.sql` conta à mão (`v_ok`/`v_falhas`, zero chamadas
a `assert_zero_de`). As asserções de **cenário** (que montam duas ou três linhas) seguem a forma do
arquivo. A asserção de **equivalência total** (universo = todas as linhas) usa
`pg_temp.assert_zero_de`, **porque é a única com universo que poderia estar vazio** e virar
tautologia — que é exatamente o que aquela função recusa. O resultado dela alimenta `v_ok`/`v_falhas`
para que a linha `FIM` continue somando certo. Qual vence onde está escrito no cabeçalho do roteiro.

**D10 — a trava (e) é derivada do catálogo, com exceções NOMINAIS.** Varre
`pg_get_functiondef` de toda função de `public` que cite `movimentacoes` (**19** das **65**) e
`pg_get_viewdef` das **9** views, e reprova quem desempatar por `id`. Três exceções, cada uma com
motivo e migration na mesma linha:

1. `apagar_ativo` (`0082:157`) — `order by created_at, id` dentro de `jsonb_agg`: **serializa** o
   despejo de backup, não escolhe linha.
2. `apagar_ativos_conflito_filiais` (`0132:831`) — idem.
3. `apagar_movimentacao` (`0090:182`) — **o desempate por `id` é inalcançável**: a recusa de empate
   da `0087` (`0090:173`) barra, linhas antes, **todo** ativo em que dois `created_at` sejam iguais.
   Quando o `exists` de `:182` roda, os `created_at` do ativo já são distintos dois a dois e o `id`
   nunca decide. Com asserção (`10c`), não com fé. **É por isso que ela NÃO é recriada** — e a
   consequência prática pesa: o corpo dela contém `delete from public.movimentacoes`, logo bate no
   **gate** do modo automático (confirmado: `apagar_movimentacao` = **true**, `aplicar_movimentacao`
   e `rel_estoque_asof` = **false**). Recriá-la exigiria uma `0135` pelo caminho B, que **não pode
   ser aplicada nesta run** e só engordaria a fila pendente. A ordem previa essa `0135`; a medição
   a torna **desnecessária**.

## 2. A varredura completa (arquivo:linha do corpo VIGENTE)

### Banco — decide qual linha vale (`escolhe_linha = true`)

| Objeto | Corpo vigente | Régua de hoje | Ação na F53 |
|---|---|---|---|
| `rel_estoque_asof` | `0110:269-271` | `data desc, created_at desc, (tipo='ajuste') desc, id desc` | → `data desc, ordem desc` |
| `aplicar_movimentacao` (trava do estorno) | `0110:124-126` | `(created_at, id)` | → `(created_at, ordem)` |
| `apagar_movimentacao` (recusa de empate) | `0090:168-174` | `created_at =` | **fica** (D10.3) |
| `apagar_movimentacao` (trava de avanço) | `0090:177-182` | `(created_at, id)` | **fica** (D10.3) |
| `v_conflitos_filiais.ultima_mov_tipo` | `0096:76-80` | `data desc, created_at desc` (**sem desempate**) | → `+ ordem desc` |

### Banco — só serializa saída (`escolhe_linha = false`)

`apagar_ativo` (`0082:157`), `apagar_ativos_conflito_filiais` (`0132:831`) — exceções nominais.
Índices: `movimentacoes_ordem_lista_idx` (`0105:21`), `mov_created_idx` (`0003:96`),
`movimentacoes_forcado_idx` (`0079:67`), `mov_ativo_idx`, `movimentacoes_pkey` e mais 6 — **nenhum
dropado**.

### App — dentro do escopo (as cinco de `queries/movimentacoes.ts`)

| Linha | Hoje | Depois | Por quê |
|---|---|---|---|
| `:112-114` linha do tempo | `created_at, data, id` desc | **`created_at, ordem`** desc | casa com a trava (D5) |
| `:165` `ultimoEnvioManutencao` | `created_at` desc, sem desempate | `created_at, ordem` desc | D6 |
| `:200` `ultimaMovimentacaoDoUsuario` | `created_at` desc, sem desempate | `created_at, ordem` desc | D6 — o de maior risco |
| `:268` `ultimosAtivosMovimentadosDoOperador` | `created_at` desc, sem desempate | `created_at, ordem` desc | D6 |
| `:679-681` `queryLista` | `data, created_at, id` desc | **`data, ordem`** desc | D3 |

### App — FORA do escopo, nomeados para o backlog

`queries/relatorios/estoque.ts:336/414/438/491`, `queries/relatorios/movimentacoes.ts:74/250/312/341`,
`queries/compras.ts:278/302`, `queries/dev-destrutivo.ts:149`, `queries/import-logs.ts:236`
(`order('id')` para **estabilidade de paginação** — legítimo: `paginarTodos` exige ordem total, e
`id` é uma), e **`actions/termos.ts:211`** — `.order('id')` **sozinho** para escolher a "movimentação
de referência" do termo de lote, que decide a cidade da assinatura: como `id` é `gen_random_uuid()`,
isso é **sorteio disfarçado de determinismo**. Achado real, fora do escopo desta ordem.

## 3. O SQL do backfill (desenhado)

```sql
alter table public.movimentacoes add column ordem bigint;

do $$
declare v_antes bigint; v_depois bigint; v_divergentes bigint;
begin
  select count(*) into v_antes from public.movimentacoes;
  perform set_config('estoque.dev_destrutivo', 'on', true);   -- idioma da 0110:373
  update public.movimentacoes m set ordem = r.n
    from (select id, row_number() over (order by data, created_at, (tipo = 'ajuste'), id) as n
            from public.movimentacoes) r
   where r.id = m.id;
  perform set_config('estoque.dev_destrutivo', 'off', true);  -- idioma da 0110:395
  -- contagens + equivalência, DENTRO da mesma transação
exception when others then
  perform set_config('estoque.dev_destrutivo', 'off', true);  -- a janela não vaza pelo erro
  raise;
end $$;
```

⚠ **Tudo num bloco `do $$` só**, e não em statements soltos: `set_config(…, true)` é local à
**transação**, e submeter o arquivo em pedaços faria de cada pedaço a sua própria transação — o
`set` não alcançaria o UPDATE e o `42501` que voltasse seria **culpa do método, não da guarda**.
O bloco `do` é atômico por construção, independentemente de como o arquivo for submetido.

## 4. Os cenários do roteiro (rótulo a rótulo)

`supabase/tests/asof_desempate.sql`, hoje com 4 (`1`, `2a`, `2b`, `2c`), ganha:

| Rótulo | O que prova |
|---|---|
| `3a` | duas movimentações do mesmo ativo com `(data, created_at)` IGUAIS recebem `ordem` distinta e ordenada, e o par compra+ajuste resolve para o **ajuste** (a regra da `0054`, agora por `ordem`) |
| `3b` | a **equivalência total**: zero linhas onde `row_number()` pela quádrupla difira de `ordem` (`assert_zero_de`, universo = todas as linhas) |
| `3c` | a `ordem` de duas linhas gravadas na MESMA transação é **distinta e crescente** |
| `4a` | a trava do estorno **recusa a penúltima** |
| `4b` | a trava do estorno **aceita a última** |
| `5a` | **`guarda_acervo` volta a recusar UPDATE** em `movimentacoes` com `42501` depois da migration |
| `6a` | **o cenário retroativo** — uma movimentação com `data` retroativa inserida DEPOIS de uma com data corrente, mesmo ativo: `rel_estoque_asof` na data intermediária **não muda**. É o único que distingue `data desc, ordem desc` de `ordem desc` puro |
| `7a` | a sequência não ficou atrás do `max(ordem)`: um INSERT novo recebe `max+1` e **não** viola o único |
| `10a` | derivação do catálogo: **nenhuma função viva** desempata `movimentacoes` por `id`, com as **três** exceções nominais |
| `10b` | auto-sabotagem: uma função fictícia que desempata por `id` **é acusada** pela varredura |
| `10c` | em `apagar_movimentacao`, a recusa de empate vem **ANTES** da comparação por `id` (prova por `position()` no `pg_get_functiondef`) — é o que torna o `id` inalcançável |

## 5. A ORDEM DE ROLLBACK

**`0133`** (aditiva — nenhuma linha do acervo é tocada além da coluna nova):

1. `drop index if exists public.movimentacoes_ordem_uidx;`
2. `alter table public.movimentacoes alter column ordem drop identity if exists;`
3. `alter table public.movimentacoes drop column ordem;`
4. `notify pgrst, 'reload schema';`

**`0134`** (recriação de função/view — o rollback é o corpo anterior):

1. `create or replace function public.rel_estoque_asof(...)` com o corpo da **`0110`**
2. `create or replace function public.aplicar_movimentacao()` com o corpo da **`0110`**
3. `create or replace view public.v_conflitos_filiais ...` com o corpo da **`0096`**
4. `notify pgrst, 'reload schema';`

⚠ **A ordem entre as duas:** reverter a `0134` **antes** da `0133` — o corpo novo cita `ordem`, e
dropar a coluna primeiro com `cascade` levaria as funções junto.

## 6. A ordem de execução

A (0133) → B (0134) → C (app) → D (rig, versão, PR), com `lint`/`test`/`tsc` verdes entre cada uma.
Apply: **captura do "antes"** (feita) → **ensaio** → verificação → **produção** → contagens
imediatas → `notify pgrst` → as 12 datas → `db:types`. A Frente C **só entra no merge** com a
`0133` confirmada em produção.

## 7. As 12 datas de amostra (escolhidas, com motivo)

`2024-01-08` (data_min medida) · `2026-07-27` (import de abertura da maior leva: 1125 ativos, 2133
movimentações em **uma única** transação) · `2026-07-31` (2ª leva: 473 ativos, 913 movimentações em
4 sub-transações) · `2026-08-04` e `2026-08-17` (dias com estorno real) · `2026-09-01` (maior lote
fora do import: 5 ativos, mesmo `created_at`) · `2026-09-04` (estorno + mini-lote de 2 ajustes na
mesma transação) · `2024-06-15`, `2024-12-01`, `2025-06-01`, `2026-03-01` (espalhadas pelos quartis)
· `2026-09-08` (data_max medida).
