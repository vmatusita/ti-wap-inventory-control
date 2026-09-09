# F53 — A ordem exata das movimentações

*Ordem de serviço gerada em 09/09/2026, a partir de `docs/PLANO-MULTIEMPRESA.md` §5, Bloco C.*

**Por que ela existe.** A tabela `movimentacoes` é a fonte da verdade deste sistema, e ela **não tem ordem
total**. Quando duas movimentações do mesmo ativo empatam em `(data, created_at)` — o que acontece toda vez
que uma transação grava mais de uma linha —, quem vem depois é decidido pelo `id`, que é um **uuid v4
aleatório**. O sistema já pagou por isso duas vezes, em produção: a `0054` corrigiu a reconstrução as-of que
"resolvia errado em ~metade dos 1.002 ativos afetados" pelo import de abertura, e a `0087` fechou um defeito
"REAL da `0082` que atinge em cheio o acervo de produção" **recusando** o empate em vez de ordená-lo. As duas
foram remendos no sintoma: nenhuma das duas deu ordem à tabela.

E a premissa que protegia o resto — *"cada movimentação é uma transação, logo `created_at` é monotônico"* —
**deixou de valer**. As migrations `0117`, `0121`, `0122`, `0123` e `0126` gravam mais de uma movimentação por
transação, e `now()` é o instante de início da transação: todas nascem com o mesmo `created_at`. O comentário
de `src/lib/queries/movimentacoes.ts:92` ainda afirma a premissa velha ("created_at e monotonico por ativo em
producao"), vinte linhas antes do código que a contradiz.

⚠ **Onde o empate MORDE, medido — e não é onde a leitura apressada supõe.** Todas as leituras em jogo filtram
por ativo (`distinct on (e.ativo_id)` em `0110:269`, `m.ativo_id = new.ativo_id` em `0110:125`,
`.eq('ativo_id', …)` em `movimentacoes.ts:111`), e o lote da F38 **não repete ativo**:
`src/lib/actions/movimentacoes.ts:266-274` recusa (*"O lote não pode repetir o mesmo ativo"*) e os laços de
`0117:239`, `0123:173` e `0126:273` inserem **uma** movimentação por ativo do payload; `0121`/`0122` inserem
**uma** só (o estorno) e o resto vai para `lancamentos_item`. O empate **do mesmo ativo** nasce do **import**
— compra de abertura + ajuste de reconciliação na mesma transação (`0034:345/361`, `0080:299/310`,
`0094:302/313`, `0131:446/457`) —, que é exatamente o caso que a `0054` documentou. O lote da F38 prova outra
coisa, que também vale: movimentações **distintas** da mesma transação recebem `ordem` distinta e ordenada.

Esta fase substitui o sorteio por uma sequência — `movimentacoes.ordem` —, **sem mudar um único número
histórico**: o backfill é escolhido para reproduzir, byte a byte, a ordem que o desempate atual produz hoje.
O que muda é o futuro.

**Por que ela vem AGORA.** Porque ela é pré-requisito da F60 (`ordem` é o cursor de que a paginação keyset
precisa) e da F65 (`(empresa_id, ordem)`), e porque é o item mais barato do plano que ainda é caro de adiar:
cada mês novo é mais linha para o backfill percorrer dentro da janela que desarma a `guarda_acervo`.

**O que esta fase NÃO é.** Não é paginação keyset — isso é F60, e esta fase entrega o **cursor**, não o uso.
Não é `(empresa_id, ordem)` nem índice composto de tenant — é F65. Não é `empresa_id` em lugar nenhum. Não é
ordenar `lancamentos_item` (a mesma classe de defeito existe lá, na `0127`, e ela fica nomeada no backlog).
Não é tocar `paginarTodos`, que a F60 vai reescrever. E **não é oportunidade de "arrumar o histórico"**:
nenhum número de relatório passado pode mudar, e o relatório final tem de provar isso com as duas leituras
lado a lado.

---

**Vinte e quatro fatos de leitura do repositório, medidos em 09/09/2026, que a ficha do plano não tem.**
Estão agrupados pelas quatro frentes. **Refaça cada medição antes de usá-la.**

## Frente A — a coluna e o backfill (itens 1 a 3 da ficha)

1. **As migrations desta fase são a `0133` e a `0134`, não a `0132` e a `0133`.** A ficha promete
   `0132`/`0133`; a F52 usou a `0132` (`0132_guardas_de_escopo.sql`). Há **131 arquivos** em
   `supabase/migrations/` (a `0029` é um gap real), e o último é a `0132`. A versão da fase é a **1.58.0**
   sobre a `1.57.0` do `package.json`.

2. **A fila `0129` → `0130` → `0131` → `0132` NÃO está aplicada** — nem em produção, nem no ensaio (medição
   escrita no `RELATORIO-F52.md` §10, 08/09/2026: zero auxiliares `import_*` nos dois). **A F53 não depende
   de nenhuma delas:** `rel_estoque_asof` vem da `0110`, `guarda_acervo` da `0081`, `aplicar_movimentacao` da
   `0110`, e nenhuma das quatro pendentes toca `movimentacoes`. **Decisão do Johnny para esta fase: ignorar a
   fila** — aplicar só a `0133`/`0134`, e repetir a pendência no relatório com a ordem correta
   (`0129`→`0130`→`0131`→`0132`, na mesma janela ou nenhuma). Confira o estado real antes de aceitar isso.

3. **A `guarda_acervo` recusa o UPDATE, inclusive para o service role.** `0081:87` define a função,
   `0081:94` lê a janela (`current_setting('estoque.dev_destrutivo', true) = 'on'`), `0081:113-114` levanta
   `42501` em qualquer UPDATE — *"Registro histórico não se altera: % é imutável"* —, e `0081:134-136` cria
   o trigger `movimentacoes_guarda_acervo` `before insert or update or delete … for each row`. O caminho
   doutrinariamente correto para o backfill é `set local estoque.dev_destrutivo = 'on'` **dentro da própria
   migration**: o mecanismo existe exatamente para isso, e o `set local` morre com a transação.

4. **O UPDATE não dispara a máquina de estados.** O único outro trigger de `movimentacoes` é
   `trg_aplicar_movimentacao` (`0004:135-137`), e ele é `before **insert**` — só INSERT. Meça você mesmo
   (`select tgname, tgtype from pg_trigger where tgrelid = 'public.movimentacoes'::regclass and not
   tgisinternal`) antes de confiar nesta linha: se houver um terceiro trigger que este arquivo não viu, o
   backfill deixa de ser inócuo.

5. **`movimentacoes` tem NOVE índices, e dois deles decidem esta fase.** `mov_ativo_idx (ativo_id, data
   desc)`, `mov_filial_data_idx` e `mov_created_idx (created_at desc)` (`0003:94-96`);
   `movimentacoes_forcado_idx (ativo_id, created_at desc)` parcial (`0079:67-68`);
   `movimentacoes_ordem_lista_idx (data desc, created_at desc, id desc)` (`0105:21-22`, F33/D2); mais quatro
   de FK (`0106:31-34`). Os dois que importam: **`movimentacoes_ordem_lista_idx` serve a lista** de
   `/movimentacoes` (o cabeçalho da `0105` traz a medição que o justificou: 159 buffers / ~68,6 ms → 6
   buffers / ~0,11 ms) e **`mov_ativo_idx` serve a linha do tempo de um ativo**. ⚠ **Nenhum índice cobre
   `(ativo_id, ordem)`** — e a Frente C troca justamente a chave dessas duas consultas. Medir o plano depois
   da troca não é opcional (ver o fato 18 e a Decisão 8).

6. **O tamanho da tabela**, medido em 10/08/2026 no cabeçalho da `0105`: 3.288 linhas em produção. Meça o
   valor de hoje antes de dimensionar a janela — e ponha o número no relatório.

7. **O backfill da ficha está certo, e vale entender por quê.** `row_number() over (order by data, created_at,
   (tipo = 'ajuste'), id)` é a ordem ASC total; revertê-la (`ordem desc`) devolve exatamente
   `data desc, created_at desc, (tipo='ajuste') desc, id desc`, que é o desempate vivo. Em Postgres
   `false < true`, então `(tipo='ajuste')` ASC põe o não-ajuste primeiro e, invertido, põe o ajuste na
   frente — que é a regra que a `0054` introduziu. A `row_number()` é **global** (sem `partition by
   ativo_id`) e isso basta: uma ordem total global, restrita a um ativo, preserva a ordem relativa.

## Frente B — o desempate no banco (a ficha erra dois dos três nomes)

8. **`rel_estoque_asof` vive na `0110` (`:245`), não na `0054`.** O desempate está em `0110:270-272`:
   `order by e.ativo_id, e.data desc, e.created_at desc, (e.tipo = 'ajuste') desc, e.id desc`. A `0054` é o
   histórico da regra do ajuste; a `0110` é o corpo vigente. Confirme com `pg_get_functiondef`, não com grep.

9. **`status_apos_movimentacao` NÃO desempata nada — a ficha erra ao nomeá-la.** O corpo vigente está na
   `0047:19`: é uma tabela de transição `(status, tipo) → status`, `immutable`, sem `order by`, sem leitura
   de tabela nenhuma. Não há o que trocar nela. **Não a recrie para "cumprir a ficha"** — recriar uma função
   `immutable` sem mudar nada é ruído no diff e mais uma cópia para a próxima fase manter.

10. **`estornar_movimentacao_com_itens` também não desempata movimentações.** O corpo vigente está na
    `0122:169`; os `order by` que ela tem (`0122:212`, dos advisory locks, e `0122:225`) ordenam os
    **lançamentos do payload** (`ajuste` positivo
    → positivos → resto, depois `item_id`, depois `estorna_id`) para fixar a ordem dos inversos, e não toca
    `movimentacoes`. Se a sua varredura achar dentro dela um ponto que dependa da ordem de `movimentacoes`,
    ele entra; senão, o relatório registra a divergência com a evidência.

11. **O desempate real que a ficha não nomeia está em `aplicar_movimentacao` (`0110:122-128`) — e ele tem um
    GÊMEO.** A trava *"só a última movimentação efetiva do ativo pode ser estornada"* compara, em `0110:126`,
    `(m.created_at, m.id) > (v_orig.created_at, v_orig.id)`: desempate por uuid aleatório **numa trava de
    escrita**. **`apagar_movimentacao` tem a MESMA comparação**, byte a byte, em `0090:182` (o corpo vigente
    dela está na `0090`) — e, poucas linhas antes, em `0090:173`, tem `and m.created_at = v_m.created_at`,
    que é a **recusa** do empate introduzida pela `0087`: quando `ordem` existir, essa recusa fica obsoleta,
    e deixá-la de pé é manter uma trava que recusa operação legítima por um empate que não existe mais.
    **Mais dois pontos, de outra natureza:** `apagar_ativo` (`0082:154-159`) e `apagar_ativos_conflito_filiais`
    (`0100:308`) despejam as linhas com `order by created_at, id` dentro de `jsonb_agg`. Isso é ordenação de
    **despejo de backup**, não desempate de leitura — provavelmente exceção legítima da trava, mas ela é
    **nomeada com motivo escrito**, nunca ignorada em silêncio.
    ⚠ **Atenção ao gate:** `apagar_movimentacao` e `apagar_ativos_conflito_filiais` têm `delete from
    public.movimentacoes` / `delete from public.ativos` no corpo. Se a sua varredura as trouxer para dentro
    da `0134`, a migration passa a bater no gate do modo automático e leva junto o apply automático das
    outras duas. **Se elas entrarem, entram numa migration SEPARADA (`0135`), pelo caminho B.**

12. **`v_conflitos_filiais` (`0092:115`) tem um quarto ponto, sem desempate nenhum.** O lateral de
    `0092:170-174` calcula `ultima_mov_tipo` com `order by m2.data desc, m2.created_at desc limit 1` — sem
    terceira chave. Sob empate, a view devolve um tipo arbitrário. A view **não foi recriada depois** (é a
    única definição no repositório). Entra nesta fase ou vira backlog — é uma das decisões abaixo.

13. **`0127:126` ordena `lancamentos_item` por `data desc, created_at desc`** para escolher "a reserva mais
    recente do grupo". Mesma classe de defeito, **outra tabela**. `lancamentos_item` **não** ganha `ordem`
    nesta fase (a ficha não pede, e a coluna teria de nascer com backfill próprio). Vai nomeada para o
    backlog do relatório.

14. **O `p_data` do as-of é uma pergunta sobre DATA DE NEGÓCIO, e `ordem` é insertion order.** Elas não são a
    mesma coisa: `src/lib/validators/movimentacao.ts:309` usa `dataNaoFuturaSchema`, ou seja, **o operador
    pode lançar movimentação com data retroativa**. Uma movimentação lançada hoje com `data` de anteontem
    recebe `ordem` maior que a de ontem — e trocar `data desc, created_at desc, …` por `ordem desc` **puro**
    mudaria o resultado do as-of para esses casos. Este é o ponto onde uma leitura apressada da ficha quebra
    relatório histórico. Meça quantas linhas têm `data < created_at::date` em produção antes de decidir.

## Frente C — o desempate no app (não está na ficha; é decisão do Johnny desta ordem)

15. **O app tem DUAS ordens diferentes para a mesma tabela.** `listarMovimentacoesDoAtivo`
    (`src/lib/queries/movimentacoes.ts:105-116`) ordena `created_at desc → data desc → id desc`; a lista de
    `/movimentacoes` (`movimentacoes.ts:678-681`, dentro do builder da consulta) ordena
    `data desc → created_at desc → id desc`. A primeira chave é diferente nas duas. O comentário de `:91-104`
    explica o `id`: *"created_at+data empatam quando um lote grava tudo na mesma transação, e ordenação com
    empate não pagina"*. ⚠ **Meça o alcance antes de repetir a frase do comentário:** como o lote não repete
    ativo (ver a abertura), a linha do tempo só embaralha para ativo cujo empate exista de verdade — os do
    import de abertura, e qualquer par futuro que nasça na mesma transação. Conte quantos ativos em produção
    têm duas movimentações com `(data, created_at)` iguais antes de descrever o defeito no relatório.

16. **Três leituras "qual foi a última" ordenam só por `created_at desc` com `limit 1`**, sem desempate:
    `ultimoEnvioManutencao` (`movimentacoes.ts:165`), `ultimaMovimentacaoDoUsuario` (`:200`) e a de `:268`
    (leia o que ela alimenta antes de mexer). Empate ali devolve linha arbitrária. Não estão na ficha; são
    decisão sua, uma a uma.

17. **`paginarTodos` vem de `@/lib/queries/relatorios/comum`** (`movimentacoes.ts:17`) e é a função que a
    **F60** vai mudar (o `cap` como terceiro parâmetro obrigatório e o laço interno virando keyset).
    **Esta fase não a toca** — só troca as chaves passadas para `.order()` dentro do callback.

18. **O índice `movimentacoes_ordem_lista_idx` FICA.** Quando a lista passar a ordenar por `ordem`, ele deixa
    de ser usado — mas a decisão de aposentá-lo é da F60, que é quem vai desenhar a paginação. O que esta
    fase deve fazer é **medir** (`pg_stat_user_indexes` antes e depois, `idx_scan`) e deixar o número no
    relatório e no backlog nomeado para a F60. Dropar índice de produção "porque parece morto" é como esta
    fase deixaria de ser reversível em minutos.

19. **`src/lib/types/database.ts` ganha a coluna.** `npm run db:types` só roda contra um projeto real: se o
    apply acontecer, regenere; se não, hand-fix comentado e datado com a pendência declarada — foi o que a
    F51 e a F52 fizeram, e há precedente escrito.

## Frente D — o rig, a trava e o fechamento

20. **`supabase/tests/asof_desempate.sql` JÁ EXISTE.** A ficha o lista como entrega nova; ele está no
    repositório com **quatro asserções** (o desempate da `0054` — ajuste vence compra no empate; o as-of em
    D1 antes do estorno; o as-of de hoje com o par saída+estorno anulado; e `ativos.status` batendo com o
    as-of de hoje) e termina com o contador da F45: `FIM asof_desempate: % asserções, % falhas`. Esta fase
    **estende**, não cria. ⚠ E ele **não usa** `pg_temp.assert_zero_de`: conta à mão, com `v_ok`/`v_falhas`
    (`:31-32`) e `raise notice`/`raise warning` (`:88-136`). `supabase/tests/_asserts.sql` existe e traz o
    helper que **recusa universo vazio** — a forma da casa desde a F45 —, mas misturar as duas convenções no
    mesmo arquivo sem dizer qual vence é como um roteiro fica ilegível. Decida (Decisão 9) e escreva.

21. **O injetor está em 55 mutações com teto 56** (medição da F52, no `CHANGELOG.md`). Trava nova sem mutação
    que a derrube é trava que ninguém provou saber ficar vermelha. Se o teto subir, o motivo vai escrito no
    próprio `scripts/db/mutacoes.test.mts` — é o ritual que o comentário de lá institui.

22. **Os dois checks do PR são `verificar` e `banco-sem-docker`.** `npm run db:lock` é **obrigatório** nesta
    fase, no mesmo commit das migrations: ela acrescenta duas, e o runbook (~323) manda *"quem acrescenta
    migration atualiza DUAS listas"*.

24. **⚠ O FATO CONCEITUAL, e o que mais decide esta fase: `ordem` nasce HÍBRIDA.** Para as linhas históricas
    ela é o **ranking da quádrupla** `(data, created_at, (tipo='ajuste'), id)` — por construção do backfill.
    Para as linhas futuras ela é **ordem de inserção** — por construção da identidade. As duas coincidem
    enquanto ninguém lançar movimentação com data retroativa, e divergem na primeira que lançar. Duas
    consequências, e o resto desta ordem persegue as duas: **(a)** toda comparação "antes × depois" feita
    sobre o acervo de hoje **passa com qualquer régua**, porque hoje `ordem desc`, `data desc, ordem desc` e
    a quádrupla produzem a mesma resposta — a prova das 12 datas **não discrimina** a Decisão 3, e vendê-la
    como se discriminasse é o erro mais fácil desta fase; **(b)** as travas de escrita que hoje decidem por
    `(created_at, id)` — que **ignoram `data`** — passariam a decidir por uma chave que tem `data` como
    primeira componente. Isso não é troca de desempate: é troca de semântica, e precisa de prova própria
    (Decisão 4).

23. **`src/lib/versoes/registry.ts` recusa 21 termos de desenvolvedor** — entre eles "migration", "policy",
    "schema", "deploy" e "RPC". A entrada da 1.58.0 é em linguagem de operador, e esta fase é quase invisível
    ao operador: o texto honesto é sobre a linha do tempo do ativo deixar de embaralhar movimentações
    registradas juntas.

---

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Dar ordem total à tabela `movimentacoes` — trocar o desempate por uuid aleatório, que já custou duas
correções em produção, por uma sequência — **sem mudar um único número histórico**. Ao final: a migration
`0133` traz `movimentacoes.ordem` (bigint, backfill compatível byte a byte com o desempate de hoje, `not
null`, identidade, índice único), aplicada dentro da janela `estoque.dev_destrutivo` aberta por `set local`
na própria transação, com backup e contagens; a `0134` troca o desempate nos pontos que a SUA varredura
achar — no mínimo `rel_estoque_asof` (`0110:270`) e a trava do estorno em `aplicar_movimentacao`
(`0110:123-129`); o app passa a ordenar `movimentacoes` por uma régua só, com `ordem` como desempate exato;
`asof_desempate.sql` ganha os cenários novos; e o injetor ganha as mutações que provam que as travas sabem
ficar vermelhas. Versão **1.58.0** com tag publicada; PR mergeado com `verificar` e `banco-sem-docker`
verdes; `0133` e `0134` aplicadas em **ensaio e produção**, nessa ordem, com a verificação pós-apply do
runbook.
**Nenhum relatório histórico muda de número — e isso é PROVADO, não afirmado: `rel_estoque_asof` idêntica
em 12 datas de amostra, antes e depois, nos dois ambientes. Nenhum `empresa_id`. Nenhuma paginação keyset.
Nenhuma dependência nova.**

# Contexto

## Leia antes de escrever qualquer código
- `@CLAUDE.md` manda em tudo: modo autônomo e as regras permanentes. Pesam aqui a **1** (escopo da ordem
  atual — F60 e F65 estão encostadas nesta fase), a **2** (NUNCA dados reais em fixture), a **3** (custo
  R$ 0, stack FECHADA), a **5** (produção com autoproteção) e a **8** (versão, sem exceção).
- `@docs/PLANO-MULTIEMPRESA.md`, nesta ordem: **§4** (as 10 regras comuns — em especial a **2**, estado de
  repouso; a **3**, escopo fora explícito; a **4**, trava antes da correção; a **8**, migration nunca se
  edita; e a **10**, toda fase que toca banco declara a ORDEM de rollback), **§5 → F53** (a ficha completa) e
  depois **§5 → F60** e **§5 → F65**, não para fazer, mas para saber o que **não** é seu: a paginação keyset
  e o `cap` de `paginarTodos` são F60; `(empresa_id, ordem)` é F65.
  ⚠ **A ficha da F53 no §5 é a fonte da verdade do escopo.** Onde este prompt e ela divergirem, vale a ficha
  — exceto onde este prompt traz uma MEDIÇÃO contra o disco de hoje; aí vale a medição, e ela vai para o
  relatório com a divergência explicada.
- `@supabase/migrations/0110_detentor_por_estado.sql` — INTEIRA, com os comentários. É o coração da fase:
  `aplicar_movimentacao` (`:88`, a trava do estorno em `:122-128`, a comparação em `:126`) e
  `rel_estoque_asof` (`:245`, o `order by` em `:270-272`). Note também `:373` e `:395`: é ali que está o
  idioma da casa para abrir e fechar a janela destrutiva — `perform set_config('estoque.dev_destrutivo',
  'on', true)` / `'off'`, e não `set local` solto.
- `@supabase/migrations/0090_guarda_furos_revisao.sql` — o corpo vigente de `apagar_movimentacao`: a MESMA
  comparação `(created_at, id)` em `:182` e a recusa de empate da `0087` em `:173`. É o gêmeo da trava do
  estorno, e ele não está na ficha.
- `@supabase/migrations/0082_dev_apagar.sql` (`:154-159`) e `@supabase/migrations/0100_conflito_lock_e_backup.sql`
  (`:308`) — os dois despejos com `order by created_at, id` dentro de `jsonb_agg`. Leia para decidir se são
  exceção da trava, e escreva o motivo.
- `@supabase/migrations/0081_guarda_acervo.sql` — INTEIRA. A janela, o trigger e a razão de existirem. É o
  arquivo que decide se o backfill roda ou levanta `42501`.
- `@supabase/migrations/0054_asof_desempate_ajuste.sql` — o CABEÇALHO inteiro antes do corpo. Ele conta o
  bug de 501 ativos, e é ele que explica por que `(tipo = 'ajuste')` está no desempate. Ler o corpo sem ler o
  cabeçalho é como esta fase apaga a regra da `0054` por engano.
- `@supabase/migrations/0087_dev_correcoes_revisao.sql` — o outro precedente de empate, o que foi resolvido
  **recusando** em vez de ordenar.
- `@supabase/migrations/0117_criar_movimentacao_com_itens.sql`, `@supabase/migrations/0121_estorno_com_itens.sql`,
  `@supabase/migrations/0122_ordem_dos_inversos.sql` e `@supabase/migrations/0123_ordem_dos_itens_do_lote.sql`
  — as quatro que gravam mais de uma movimentação por transação. São elas que tornam o empate rotina, e é
  nelas que estão os cenários do roteiro novo.
- `@supabase/migrations/0105_indice_ordem_movimentacoes.sql` e `@supabase/migrations/0079_forcado_marca.sql`
  — os índices que já existem sobre a ordenação. **Não os drope** (ver o escopo).
- `@docs/RUNBOOK-BANCO.md`, nesta ordem: **"O caminho, em 30 segundos"** (~21), **"O gate do modo
  automático"** (~43), **"Aplicar uma migration" A e B** (~49), **"Rollback — a regra geral"** (~125),
  **"Roteiros de teste SQL — rode TODOS ao mexer em função/trigger"** (~142), a **"Sonda de paridade
  ensaio × produção"** (~181) — é ela, e não o `md5` cru, que compara ambientes —, a **trava de hash**
  (~279) com o *"Quem acrescenta migration atualiza DUAS listas"*, as **"Armadilhas conhecidas"** (~382) e a
  **"Escalada"** (~391), que diz nominalmente: *contagem do acervo mudou quando a migration não devia tocar
  dado = pare*.
- `@supabase/tests/asof_desempate.sql` (o que ele já prova), `@supabase/tests/_asserts.sql` (a forma que
  recusa universo vazio), `@supabase/tests/f38_itens_com_ativo.sql` e `@supabase/tests/maquina_estados.sql`
  (onde os lotes e os estornos já são exercitados).
- `@scripts/db/mutacoes.mjs` (a forma de uma mutação e da quarentena; `trocarNoCorpo` e `corpoVigente`),
  `@scripts/db/mutacoes.test.mts` (o teto e os motivos escritos) e `@scripts/db/corpo-vigente.mjs`.
- `@src/lib/queries/movimentacoes.ts` — as CINCO leituras que ordenam a tabela (`:105-116`, `:165`, `:200`,
  `:268`, `:678-681`) e o comentário de `:92`, que afirma uma premissa que as migrations acima derrubaram.
- `@src/lib/actions/movimentacoes.ts:266-274` — a recusa de ativo repetido no lote. É ela que diz onde o
  empate do MESMO ativo pode e não pode nascer.
- `@docs/prompts/F52-guardas-de-escopo-ultracode.md` e `@docs/RELATORIO-F52.md` — o padrão de ordem e de
  relatório da casa, e o estado da fila de apply.

## O diagnóstico — CONFIRA CADA PONTO VOCÊ MESMO ANTES DE ACEITAR
Os vinte e três fatos medidos estão no cabeçalho desta ordem, fora do bloco do prompt. Releia-os e **refaça
cada medição**: o número da última migration; o estado da fila `0129`→`0132`; os gatilhos vivos de
`movimentacoes`; os índices; a contagem de linhas; o corpo vigente de `rel_estoque_asof`, de
`aplicar_movimentacao`, de `status_apos_movimentacao` e de `estornar_movimentacao_com_itens` por
`pg_get_functiondef`; as cinco leituras do app; as quatro asserções que `asof_desempate.sql` já tem; o lote
de mutações e o teto. Onde a sua medição divergir da minha, **a sua ganha** — desde que ela esteja no
relatório com a divergência explicada.

**Uma medição é obrigatória antes da Decisão 3, e não existe no cabeçalho:** quantas linhas de
`movimentacoes` têm `data < created_at::date` em produção (movimentação lançada com data retroativa), e qual
o maior atraso. É esse número que diz se `ordem` pode substituir `data desc` ou só desempatar depois dela.

## Comandos que já existem — use, não reinvente
- `npm run lint` · `npm run test` · `npm run build` · `npx tsc --noEmit` · `npm run contraste`
- `npm run db:test` · `npm run db:test:um <roteiro>` · `npm run db:test:mutations` · `npm run db:types:diff`
- `npm run db:lock` — **obrigatório**: a fase acrescenta a `0133` e a `0134`. Mesmo commit das migrations.
- `npm run db:types` — depois do apply. Se o apply não acontecer, hand-fix comentado e datado com a
  pendência declarada (precedente da F51 e da F52).
- `npm run verificar:actions` · `node scripts/smoke/smoke-prod.mjs`
- `gh run watch` / `gh run view --log-failed` — o `gh` EXISTE nesta máquina (F45 §15); pode não estar no PATH
  da sessão. *"Comando não encontrado" é hipótese, não conclusão.*

# Escopo

## Dentro — quatro frentes, nesta ordem

### Frente A — a coluna e o backfill (migration `0133`)
- `alter table public.movimentacoes add column ordem bigint;` com `comment on column` dizendo o que ela é e
  por que existe.
- Backfill `row_number() over (order by data, created_at, (tipo = 'ajuste'), id)`, **global, sem
  `partition by`** — é a ordem ASC total cuja inversa é o desempate vivo de hoje.
- **Antes do UPDATE:** backup do par `(id, data, created_at, tipo)` de todas as linhas, em arquivo de
  evidência (`docs/f53-evidencias/`), e `count(*)`. **Depois:** `count(*)` idêntico, `count(ordem) =
  count(*)`, e a conferência de que a ordem ASC por `ordem` reproduz a ordem ASC pela tripla (zero linhas
  divergentes — asserção, não olhômetro).
- A janela: aberta **dentro da mesma transação do UPDATE**, no idioma da casa
  (`perform set_config('estoque.dev_destrutivo','on',true)`, como `0110:373`), e **fechada explicitamente**
  (`'off'`, como `0110:395`) logo depois — `set local` não se fecha sozinho antes do fim da transação.
  ⚠ **A janela morre se você partir a transação:** aplicar a migration em pedaços por `execute_sql` do MCP
  faz de cada chamada a sua própria transação, o `set` não alcança o UPDATE, e o `42501` que voltar será
  **culpa do método, não da guarda**. Aplique o arquivo inteiro de uma vez (`apply_migration`). E prove, no
  roteiro, que **depois** da migration a `guarda_acervo` volta a recusar UPDATE com `42501`.
- `set not null` **antes** da identidade (`add generated … as identity` exige a coluna não-nula), depois a
  identidade, depois `create unique index movimentacoes_ordem_uidx on public.movimentacoes (ordem);`.
  **Quatro armadilhas medidas, todas capazes de estourar depois do apply e não durante:**
  (i) `alter sequence … restart with` **só aceita literal** — subconsulta é erro de sintaxe; use
  `setval(pg_get_serial_sequence('public.movimentacoes','ordem'), (select max(ordem) from …))` ou
  `execute format(…)`;
  (ii) `setval(seq, N)` faz o próximo `nextval` devolver **N+1**, enquanto `restart with N` devolve **N** —
  a ficha diz "`setval` para `max+1`", que deixa um buraco de um: inofensivo, mas a ata tem de dizer o que o
  banco realmente faz, não o que a ficha escreveu;
  (iii) se a sequência ficar **atrás** do `max(ordem)`, o sintoma não aparece no apply: aparece na primeira
  movimentação registrada depois do deploy, como violação do índice único, na cara do operador. Prove o
  contrário com um INSERT em `begin; … rollback;` depois de fechar a coluna;
  (iv) `select * into v_… from public.movimentacoes` existe em `aplicar_movimentacao` (`0110:116`),
  `apagar_movimentacao` (`0090:142`) e `0082:289`. Acrescentar coluna muda o tipo do resultado, e conexões
  vivas do pool podem estourar `0A000 cached plan must not change result type` até reciclarem. Isso **não** é
  coberto por `notify pgrst` — decida o que fazer (recriar as funções na mesma janela costuma bastar) e
  escreva na ata.
- O **cabeçalho da migration declara a ORDEM DE ROLLBACK** (regra 10 do §4), que é o inverso da de apply.

### Frente B — o desempate no banco (migration `0134`, separada, mesma fase)
- **Varra primeiro, decida depois.** Enumere TODO ponto do banco que ordena ou compara `movimentacoes` por
  `created_at` e/ou `id`: `pg_get_functiondef` de todas as funções, `pg_get_viewdef` de todas as views,
  índices, checks. Ponha a lista em `PLAN-F53.md` com arquivo:linha **antes** de trocar qualquer coisa.
- Os dois pontos certos: `rel_estoque_asof` (o `order by` do CTE `ult`) e a trava do estorno em
  `aplicar_movimentacao` (`0110:126`) — e **nenhum dos dois muda sem a prova da Decisão 4**.
- **O gêmeo, que a ficha não nomeia:** `apagar_movimentacao` (`0090:182`) tem a mesma comparação, e
  `0090:173` tem a recusa de empate da `0087`, que fica obsoleta quando `ordem` existir. Tratar um e deixar o
  outro é ficar com duas réguas para a mesma pergunta — o defeito que esta fase existe para matar. ⚠ Mas o
  corpo dela contém `delete from public.movimentacoes`: **se ela entrar, entra numa migration SEPARADA
  (`0135`), pelo caminho B**, para não levar junto o apply automático da `0133`/`0134`.
- `v_conflitos_filiais.ultima_mov_tipo` e o que mais a varredura achar: decisão sua (Decisão 7). O que a
  varredura adotar **é escopo desta fase por definição** — não conflita com o critério 21.
- **`status_apos_movimentacao` não é tocada** — ela não ordena nada, e recriá-la seria ruído no diff. Se a
  sua medição discordar, ela ganha; escreva a evidência.
- Cada função recriada é `create or replace` **puro**, assinatura byte a byte igual, e o diff contra o corpo
  vigente é **só a linha do desempate**. Use `corpo-vigente.mjs` para provar isso, como a F51 e a F52
  fizeram — não copie corpo à mão.

### Frente C — o desempate no app
- As duas leituras que hoje usam a tripla (`movimentacoes.ts:105-116` e `:678-681`) passam a usar **uma
  régua só**, com `ordem` como desempate exato. Qual régua é a Decisão 3.
- As três leituras "qual foi a última" (`:165`, `:200`, `:268`): decida uma a uma (Decisão 5) e escreva.
- **Meça o plano das duas consultas depois da troca.** Hoje a lista é servida por
  `movimentacoes_ordem_lista_idx` e a linha do tempo por `mov_ativo_idx (ativo_id, data desc)`; **nenhum
  índice cobre `(ativo_id, ordem)`**. Se o `EXPLAIN ANALYZE` mostrar Sort ou Seq Scan onde antes havia Index
  Scan, **criar o índice novo faz parte desta fase** (Decisão 8) — regredir a consulta que a fase mais mexe
  seria trocar um defeito de correção por um de desempenho.
- `src/lib/types/database.ts` ganha `ordem` (regenerado se houver apply; hand-fix datado se não).
- Os testes de `movimentacoes.test.ts` que dependam da ordem acompanham.
- ⚠ **TRAVA DE MERGE: a Frente C só entra na `main` com a `0133` aplicada em produção e confirmada.** Sem a
  coluna no banco, `.order('ordem')` devolve `42703` na lista e na linha do tempo — o app quebra no deploy.
  Se o apply não acontecer, a Frente C fica na branch, o PR sobe sem ela, e o relatório declara isso como a
  pendência número um. É a regra 2 do §4 do plano: nada de estado intermediário esperando backfill.

### Frente D — a trava, o rig e o fechamento
- `supabase/tests/asof_desempate.sql` estendido, com pelo menos: (a) duas movimentações gravadas na MESMA
  transação recebem `ordem` distinta e ordenada, e o par compra+ajuste do import (mesmo ativo, mesmo
  `(data, created_at)`) resolve para o ajuste, como a `0054` exige; (b) o as-of de hoje é idêntico ao de antes
  da fase, nos cenários que o roteiro já monta; (c) a trava do estorno recusa a penúltima e aceita a última;
  (d) `guarda_acervo` volta a recusar UPDATE depois da migration; (e) nenhuma função viva desempata
  `movimentacoes` por `id`, com as exceções **nomeadas** e com motivo — no mínimo os dois despejos de backup
  (`apagar_ativo`, `apagar_ativos_conflito_filiais`), que ordenam para serializar, não para escolher linha.
- **(f) O cenário que decide a Decisão 3, e que nenhuma outra asserção substitui:** insira uma movimentação
  com `data` RETROATIVA depois de uma com data corrente, para o mesmo ativo, e exija que `rel_estoque_asof` na
  data intermediária **não mude**. É o único cenário que distingue `ordem desc` puro de `data desc, ordem
  desc` — a comparação das 12 datas passa com os dois, porque o acervo de hoje não tem o caso.
- **(g) O conjunto dos estornáveis, antes e depois** (Decisão 4): a lista de movimentações que a trava
  aceitaria estornar tem de ser idêntica, ativo a ativo. Se divergir, a troca da trava não é refatoração.
- Mutações novas em `scripts/db/mutacoes.mjs`, uma por trava nova, com `derruba` apontando o rótulo exato.
  Teto sobe com motivo escrito no próprio teste.
- `npm run db:lock`; `CHANGELOG.md`; `package.json` **1.58.0**; `src/lib/versoes/registry.ts` em linguagem
  de operador; tag anotada `v1.58.0`; ata em `docs/DECISOES.md`; PR com os dois checks verdes; deploy.
- `docs/MATRIZ-REGRAS.md` ganha a regra da ordem total (leia o fim do arquivo para o próximo id da família
  certa — não invente o prefixo).

## Fora — não toque
- **Paginação keyset e `paginarTodos`** — é F60, inclusive o `cap` como terceiro parâmetro. Esta fase entrega
  o cursor, não o uso.
- **`(empresa_id, ordem)`, `empresa_id`, `membros`, `plataforma_admins`, qualquer tabela de tenant** — F62/F65.
- **`lancamentos_item`**: nenhuma coluna `ordem`, nenhum backfill. O ponto da `0127:126` vai para o backlog.
- **Os índices existentes** (`movimentacoes_ordem_lista_idx`, `movimentacoes_forcado_idx`, `mov_created_idx`):
  medir sim, dropar não.
- **A fila `0129`→`0132`**: não aplique, não reordene, não a inclua no PR. Confira o estado e repita a
  pendência no relatório, com a ordem correta.
- **Migration já aplicada**: nunca se edita (regra 8 do §4; `migrations.lock.json` reprova).
- **Formulários, layout, régua visual, componentes** — nada de UI além da ordenação das leituras nomeadas.
- Não altere teste existente para ficar verde. Se um teste existente estiver errado de fato, registre em
  `docs/DECISOES.md` e aponte no relatório — não o edite para passar.

# Critérios de aceitação
1. `movimentacoes.ordem` existe, `bigint`, `not null`, com identidade e índice único, e `comment on column`
   explicando o que é.
2. `count(*)` de `movimentacoes` é **idêntico** antes e depois, nos dois ambientes, e `count(ordem) =
   count(*)`. Nenhuma outra coluna mudou em nenhuma linha (prova por comparação do backup do par
   `(id, data, created_at, tipo)`).
3. A ordem ASC por `ordem` reproduz **exatamente** a ordem ASC por `(data, created_at, (tipo='ajuste'), id)`
   em 100% das linhas — asserção com zero divergências, não amostra. ⚠ **Escreva no relatório o que essa
   asserção prova e o que não prova:** rodada logo depois do backfill ela é quase tautológica (a coluna foi
   gerada pela expressão contra a qual está sendo comparada); o valor dela é (a) completude — nenhuma linha
   ficou de fora — e (b) **regressão**, porque a partir daí ela roda a cada `db:test` e passa a acusar linha
   nova cuja `ordem` divirja da quádrupla, que é exatamente o sinal da Decisão 3 aparecendo na vida real.
4. `rel_estoque_asof` devolve resultado **idêntico** em 12 datas de amostra, antes e depois, em **ensaio e
   produção** (o "antes" capturado e guardado ANTES do apply; a comparação por hash do conjunto ordenado,
   não por contagem).
5. Duas movimentações gravadas na mesma transação recebem `ordem` distinta e ordenada — e o par
   compra+ajuste do import (mesmo ativo, mesmo `(data, created_at)`) resolve para o ajuste, como a `0054`
   exige. **Não use "duas movimentações do mesmo ativo no lote da F38" como cenário: o lote recusa ativo
   repetido** (`actions/movimentacoes.ts:266-274`).
6. A trava "só a última movimentação efetiva pode ser estornada" continua aceitando e recusando **exatamente
   as mesmas movimentações de hoje** — conjunto comparado ativo a ativo, antes e depois (Decisão 4) — e tem
   cenário que prova a recusa da penúltima e a aceitação da última.
6-bis. Existe uma asserção que **distingue** `ordem desc` puro de `data desc, ordem desc`: o cenário da
   movimentação retroativa (Frente D, item f). Sem ela, nenhuma prova desta fase discrimina a Decisão 3.
7. `guarda_acervo` volta a recusar UPDATE em `movimentacoes` com `42501` depois da migration — asserção no
   roteiro, não inspeção.
8. Nenhuma função viva desempata `movimentacoes` por `id`; as exceções, se houver, são nomeadas com motivo
   escrito.
9. As duas leituras do app que usavam a tripla passam a usar a mesma régua, com `ordem`; a linha do tempo de
   um ativo com lote da F38 sai em ordem estável e reproduzível.
10. O diff de cada função recriada na `0134` é **só a linha do desempate** — provado por
    `corpo-vigente.mjs`, com o número de linhas removidas por função no relatório.
11. `npm run db:test` inteiro verde, com o total de asserções antes e depois por roteiro.
12. `npm run db:test:mutations` verde, com as mutações novas acusadas pelo rótulo nomeado.
13. `npm run lint`, `npm run test`, `npm run build` e `npx tsc --noEmit` limpos.
14. `npm run db:lock` rodado no mesmo commit das migrations; `migrations.lock.json` no diff.
15. `0133` e `0134` aplicadas em **ensaio primeiro**, depois produção, com a verificação pós-apply do runbook
    e `notify pgrst, 'reload schema';` (a tabela ganhou coluna — a API precisa enxergá-la).
16. `database.ts` com `ordem` (regenerado ou hand-fix datado, com a pendência declarada).
17. Versão `1.58.0` no `package.json`, entrada no `CHANGELOG.md`, entrada no `registry.ts` em linguagem de
    operador (2 a 6 mudanças), tag anotada `v1.58.0`.
18. A ORDEM DE ROLLBACK escrita no cabeçalho das duas migrations, e ensaiada pelo menos em `begin; …
    rollback;`.
19. PR mergeado com `verificar` e `banco-sem-docker` verdes; deploy publicado; smoke rodado. ⚠ **Se a `0133`
    não foi aplicada em produção, a Frente C NÃO entra no merge** e este critério fica declaradamente
    pendente — nunca "verde por interpretação".
20. `docs/RELATORIO-F53.md` com evidências reais, as divergências contra a ficha explicadas, e a seção "o que
    este relatório NÃO prova".
21. Nada fora do escopo tocado — em especial `paginarTodos`, `lancamentos_item`, os índices existentes e a
    fila `0129`→`0132`.

# Verificação — rode de verdade
A cada incremento: `npm run lint`, `npm run test`, `npx tsc --noEmit`; `npm run build` antes do PR. Depois de
cada migration: `npm run db:lock` e, se houver Postgres alcançável, `npm run db:test` **inteiro** — não só os
roteiros que você tocou: a regra da F17 (`RUNBOOK-BANCO.md:142`) manda rodar TODOS ao mexer em função ou
trigger, e esta fase mexe em função **e** em trigger. Sem Postgres na mesa, o `banco-sem-docker` do PR é quem
roda, e você **lê a saída dele** com `gh run view --log-failed` em vez de supor. Leia a falha, corrija a
**causa raiz** e repita até passar.
**Não afrouxe trava, não acrescente exceção para ficar verde, não troque asserção por afirmação, não desligue
mutação porque deu trabalho, não altere o backfill para "bater" com uma leitura que divergiu — se divergiu, ou
o backfill está errado ou a leitura está, e as duas hipóteses se investigam.** Falha persistindo depois de ~3
ciclos: mude de abordagem e registre a troca.

Provas obrigatórias, cada uma com a saída real em `docs/f53-evidencias/`:
- **O backup do par `(id, data, created_at, tipo)`** antes do UPDATE, e a comparação depois: zero linhas com
  qualquer uma das quatro colunas diferente.
- **As contagens** `count(*)` e `count(ordem)` antes e depois, nos dois ambientes.
- **A asserção de equivalência total**: zero linhas onde `row_number()` pela tripla difere de `ordem`.
- **As 12 datas de amostra de `rel_estoque_asof`**, antes e depois, nos dois ambientes, comparadas por hash
  do conjunto ordenado. Escolha as datas de propósito: o dia do import de abertura (onde o empate compra ×
  ajuste existe), pelo menos um dia com lote da F38, o dia de um estorno, e datas espalhadas pelos 13 meses.
- **A janela**: a prova de que a `guarda_acervo` recusou UPDATE antes, aceitou dentro da janela, e voltou a
  recusar depois.
- **Sabotagem A:** em `begin; … rollback;`, crie uma coluna paralela com o backfill **errado** (por exemplo,
  sem `(tipo = 'ajuste')`) e rode a asserção de equivalência contra ela: tem de ficar vermelha. Sabotar a
  coluna definitiva depois do `set not null` e do índice único não é possível sem desmontar a migration — e
  é por isso que a sabotagem roda na cópia, não no original.
- **Sabotagem B:** devolva `id desc` ao desempate de `rel_estoque_asof` e mostre o cenário do lote ficando
  vermelho — ou, se ele ficar VERDE, **isso é o achado**: significa que o roteiro não monta um empate de
  verdade, e o cenário precisa ser reescrito antes de a fase seguir.
- **Sabotagem C:** troque a comparação por `ordem` da trava do estorno de volta para `(created_at, id)` e
  mostre o cenário da penúltima ficando vermelho.
- **Sabotagem D:** remova o índice único de `ordem` e mostre o que deixa de ser garantido.
- **`npm run db:test` completo** (com o total de asserções por roteiro, antes e depois) e
  **`npm run db:test:mutations` completo**, com a tabela final do injetor.
- **O diff da `0134`** contra o corpo vigente de cada função recriada: só a linha do desempate. Linhas
  removidas por função, contadas.
- **`npm run build` limpo**, colado por inteiro.
- **`pg_stat_user_indexes`** para os NOVE índices de `movimentacoes`, antes e depois, e o `EXPLAIN ANALYZE`
  das duas consultas trocadas (a lista e a linha do tempo) antes e depois — o insumo da F60 e da Decisão 8.
- **O cenário da movimentação retroativa** (Frente D, item f) com a saída real, e a contagem de linhas com
  `data < created_at::date` em produção que sustenta a Decisão 3.
- **O conjunto dos estornáveis** antes e depois, ativo a ativo (Decisão 4).
- **O smoke** (`node scripts/smoke/smoke-prod.mjs`) depois do deploy, com a ressalva escrita do que ele não
  exercita.

## O apply — leia isto antes de tentar
**Esta fase é caminho A, e o Johnny autorizou o apply em ensaio E produção nesta run.** Nenhuma das duas
migrations contém `delete from public.ativos` nem `delete from public.movimentacoes`, então o gate do modo
automático **não** deveria disparar. Confira isso lendo a seção "O gate" do runbook antes de tentar — e se
ele disparar mesmo assim, isso é informação: produza o handoff em `scratchpad/` (que é `.gitignore`d),
registre e siga, sem forçar.

A ordem, sem atalho:
1. **Capture o "antes" em produção** (as 12 datas, as contagens, o backup do par) **antes de qualquer DDL**.
   Leitura pura. Guarde em `docs/f53-evidencias/`.
2. **Ensaio primeiro**: `0133`, verificação pós-apply, `0134`, verificação, roteiros. Se o ensaio estiver
   INACTIVE (ele esteve nas F36, F37 e F50, e o `restore` é recusado pelo classificador), o substituto com
   precedente escrito é validar em `begin; … rollback;` contra produção — que prova sintaxe e efeito sem
   persistir — e **declarar no relatório o que ficou sem prova**. Nesse caso o apply em produção acontece
   assim mesmo, porque a fase inteira é reversível em minutos (`drop column ordem cascade` + reemitir os
   corpos anteriores) e o "antes" está capturado.
3. **Produção**: `0133`, contagens **imediatamente** (é aqui que a regra de escalada do runbook morde: se
   `count(*)` mudou, **pare** e reverta), depois `0134`, depois `notify pgrst, 'reload schema';`, depois as
   12 datas de novo e a comparação com o "antes".
4. `npm run db:types` e `npm run db:types:diff` depois do apply.
5. **A ordem migration → deploy importa**: o SQL vai antes do deploy da Vercel, porque o código novo lê a
   coluna nova.

**"Pare", aqui, não significa esperar por humano** — não há humano. Significa: **não siga para o passo
seguinte**, reverta o que foi aplicado na ordem inversa, capture a evidência da divergência, e continue a
fase com o que sobrou do escopo que não depende do banco (o rig, a documentação, o plano), entregando o
resto como pendência nomeada. Abortar sem reverter e sem registrar é a única saída proibida.

**Se a comparação das 12 datas divergir em produção, isso não é ajuste: é reversão.** Reverta a `0134`
primeiro (reemitindo os corpos anteriores), depois a `0133` (`drop column ordem cascade`), capture a
evidência da divergência e escreva o diagnóstico. Uma divergência aqui significa que a premissa central da
fase — backfill semanticamente neutro — está errada, e nenhuma correção improvisada em produção vale mais
que essa informação.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere
confirmação em nenhuma hipótese. Régua, nesta ordem: (1) este prompt; (2) a ficha da F53 no §5 do plano;
(3) as convenções do repositório (`CLAUDE.md`, `RUNBOOK-BANCO.md`, código existente); (4) a opção mais
simples e reversível. Decisão não-óbvia vai para `docs/DECISOES.md` com data, contexto, escolha e motivo.

**As dez decisões que esta fase precisa tomar por escrito, e que não têm resposta certa no prompt:**
1. **`generated always as identity` ou `by default`.** `always` recusa INSERT que informe `ordem` — o que é
   a garantia certa hoje — mas obriga `overriding system value` em qualquer restauração, e a F54 vai escrever
   exatamente uma restauração. Escolha, e escreva o custo que a F54 herda. (Terceira opção: `default
   nextval` de sequência própria, que é o que o repositório já usa em outros lugares — meça antes de supor.)
2. **Onde a identidade é acoplada.** `alter column ordem add generated always as identity` depois do
   `set not null`, com `restart with max+1` — ou sequência criada antes e `setval` depois do backfill.
   A armadilha: deixar a sequência atrás do `max(ordem)` faz o próximo INSERT violar o índice único, e o
   sintoma aparece na primeira movimentação depois do deploy, não no apply.
3. **A régua nova de ordenação — a decisão mais perigosa desta fase, e a que as suas provas NÃO decidem.**
   `ordem` é ranking da quádrupla no histórico e ordem de INSERÇÃO no futuro (fato 24); `data` é data de
   NEGÓCIO, e o operador pode lançar com data retroativa (`validators/movimentacao.ts:309`,
   `dataNaoFuturaSchema`). Sobre o acervo de hoje, `ordem desc`, `data desc, ordem desc` e a quádrupla
   **produzem a mesma resposta** — então o critério 4 (as 12 datas) passa com qualquer uma, e ele **não é
   argumento** aqui. ⚠ **A ficha afirma que "`ordem desc` reproduz exatamente a ordem de hoje", e isso é
   verdade só para o passado.** Decida entre: (a) `data desc, ordem desc` — `data` continua sendo a primeira
   chave e `ordem` vira o desempate exato, que preserva o significado do as-of para movimentação retroativa;
   (b) `ordem desc` puro, aceitando que o as-of de período passado passe a responder por ordem de registro;
   (c) réguas diferentes para as-of e para listas, com o motivo escrito. **A prova que decide é o cenário (f)
   da Frente D**, não a contagem de retroativos — a contagem (`data < created_at::date` em produção, e o
   maior atraso) mede o passado, e o risco é inteiramente futuro. Meça as duas coisas e escreva. E decida
   junto o que acontece com `(tipo='ajuste')` no desempate novo: se `ordem` já o reproduz, ele sai — com
   asserção, não com fé.
4. **A semântica das travas de escrita — a que ninguém percebe até quebrar.** A trava do estorno
   (`0110:126`) e a de `apagar_movimentacao` (`0090:182`) comparam `(created_at, id)`, que **ignora `data`**.
   `ordem` tem `data` como primeira componente. Para qualquer ativo com movimentação retroativa, "a última"
   por `(created_at, id)` e "a última" por `ordem` são **linhas diferentes** — numa trava que decide o que
   pode ser desfeito em produção. Meça quantos ativos hoje já têm essa divergência, decida (trocar por
   `ordem`, trocar por `ordem` só onde `data` empata, ou não trocar) e **prove com o conjunto dos estornáveis
   antes e depois** (Frente D, item g). Decida junto o destino de `0090:173` (a recusa de empate da `0087`),
   que fica obsoleta se a comparação virar total.
5. **A mesma régua no app, ou não.** As duas leituras hoje divergem na primeira chave (`created_at` na linha
   do tempo, `data` na lista). Unificar é a intenção desta ordem; se a sua medição mostrar que unificar muda
   o que o operador vê em caso real (retroativos), escreva a divergência e escolha com o número na mão.
6. **As três leituras "qual foi a última"** (`movimentacoes.ts:165`, `:200`, `:268`): cada uma vira
   `ordem desc`, ou fica como está com o motivo escrito. Não são da ficha — decida uma a uma, e conte o que
   cada uma alimenta antes de mexer.
7. **`v_conflitos_filiais.ultima_mov_tipo`** (`0092:170-174`, sem desempate nenhum): adotar nesta fase (uma
   linha, mesma migration) ou nomear no backlog. Meça se a view é lida em ponto onde o empate apareceria
   (`src/lib/queries/conflitos.ts`) antes de decidir.
8. **O índice `(ativo_id, ordem)`.** Hoje a linha do tempo é servida por `mov_ativo_idx (ativo_id, data
   desc)` e a lista por `movimentacoes_ordem_lista_idx`; depois da troca, nenhum dos dois cobre a chave nova.
   Meça o plano das duas consultas antes e depois e decida: criar o índice nesta fase (com a medição na ata,
   no molde da `0105`), ou registrar a regressão e deixá-la para a F60 — **com o número**, nunca com uma
   suposição de que "a tabela é pequena".
9. **A convenção do roteiro.** `asof_desempate.sql` conta à mão (`v_ok`/`v_falhas`); a casa tem
   `pg_temp.assert_zero_de`, que recusa universo vazio. Decida se as asserções novas seguem a forma do
   arquivo ou a forma da casa, e não misture sem dizer qual vence.
10. **A forma da trava (e) do roteiro** — "nenhuma função viva desempata por `id`": lista nominal de funções
   ou derivação por catálogo (`pg_get_functiondef` de todas as `public.*` que citem `movimentacoes`). A
   segunda é a doutrina que a F48 escreveu e a F52 aplicou; a primeira apodrece na fase seguinte. ⚠ **A
   derivação pura reprova o repositório como ele está**, por causa dos dois despejos de backup
   (`apagar_ativo` `0082:157`, `apagar_ativos_conflito_filiais` `0100:308`) e, se a Decisão 4 não trocar,
   também de `apagar_movimentacao`. Toda exceção é **nomeada**, com motivo escrito, nunca por prefixo nem
   por categoria.

Falha persistindo depois de ~3 tentativas: **mude de abordagem** em vez de repetir, e registre a troca.
Bloqueio real (MCP ausente, ensaio INACTIVE, gate disparando, produção inalcançável, mesa sem Postgres):
contorne se for seguro; senão, **entregue o resto e registre a pendência com o que falta para resolvê-la**.
**Não mexa em credencial, não invente caminho de apply alternativo, não force o classificador de segurança,
não desative a proteção da `main`, não rode `db:seed`/`db:reset` fora do DEV, não rode roteiro que escreve
contra produção, e não deixe a janela `estoque.dev_destrutivo` aberta fora da transação da migration.**

Uma medição sua que contrarie este prompt ou a ficha **ganha** da frase escrita, desde que a medição esteja
no relatório. Foi assim que a F46 trocou "aplicar duas vezes" por prova de determinismo, a F47 trocou 34 por
58, a F48 trocou 54 por 55, a F49 trocou nove por dezenove, a F50 trocou doze módulos por catorze, a F51
trocou 394 linhas por 393 e a F52 mediu que `p_confirmacao text default null` era overload e não `create or
replace` puro. **Aqui já há cinco divergências medidas de saída: as migrations são a `0133` e a `0134`, não
a `0132`/`0133`; `status_apos_movimentacao` NÃO desempata nada (é tabela de transição `immutable`, `0047:19`);
`estornar_movimentacao_com_itens` também não (o `order by` dela é dos lançamentos do payload, `0122`); o
terceiro desempate real é a trava do estorno em `aplicar_movimentacao` (`0110:123-129`), que a ficha não
nomeia; e `asof_desempate.sql` já existe com quatro asserções — esta fase o estende, não o cria.**

# Git e segurança
Branch `f53-ordem-das-movimentacoes`, commits pequenos e frequentes, mensagens em pt-BR no padrão
conventional (`feat(f53): …`, `test(f53): …`, `docs(f53): …`, `fix(f53): …`). PR com `gh pr create`; merge só
com os dois checks verdes. **Nunca:** push forçado, `git reset --hard`, `git checkout -- .`, `git clean -fd`,
amend de commit que não é seu, commitar `.env*`, `scratchpad/` ou dado real, editar migration aplicada, mexer
na branch protection, ou escrever em produção fora do apply autorizado da `0133` e da `0134`.

# Como trabalhar
Explore com subagentes paralelos — e **cada um volta só com resumo e NÚMEROS MEDIDOS**: (a) **a varredura do
desempate** — todo ponto do banco (funções por `pg_get_functiondef`, views por `pg_get_viewdef`, índices,
checks) e do app que ordena ou compara `movimentacoes` por `created_at`/`id`, com arquivo:linha e o que cada
um alimenta; (b) **a janela e os gatilhos** — `guarda_acervo`, os triggers vivos de `movimentacoes`, a
publicação de realtime (se a tabela estiver publicada, o UPDATE emite um evento por linha — meça e diga),
os índices e o custo estimado do backfill; (c) **onde o empate nasce** — o que exatamente `0117`, `0121`, `0122`, `0123` e `0126` gravam na mesma
transação (e para quantos ativos distintos), o par compra+ajuste do import, e quantos ativos em produção têm
hoje duas movimentações com `(data, created_at)` iguais — é isso que diz qual cenário é honesto; (d) **o rig** —
`asof_desempate.sql`, `maquina_estados.sql`, `f38_itens_com_ativo.sql`, `mutacoes.mjs`, `mutacoes.test.mts`:
quem cobra o quê, e o que quebra quando `ordem` entra; (e) **o app** — as cinco leituras, os componentes e
testes que dependem da ordem, e o que muda na tela.

Escreva `docs/PLAN-F53.md` antes de implementar, com as contagens reais, a lista completa da varredura
(arquivo:linha), o SQL do backfill desenhado, os cenários de roteiro nomeados rótulo a rótulo, as sete
decisões já tomadas e a ORDEM DE ROLLBACK das duas migrations. Implemente frente a frente, na ordem A → B →
C → D, com `lint`/`test`/`tsc` verdes entre uma e outra.

Ao final, **revisão adversarial por subagente em contexto fresco**, contra o `PLAN-F53.md` e os 21 critérios,
com estas perguntas: algum número histórico mudou — e a prova é comparação real ou afirmação? a asserção de
equivalência é **total** ou por amostra? o backfill é mesmo a inversa exata do desempate de hoje, inclusive no
tratamento de `(tipo='ajuste')` e de NULLs? existe UMA asserção que distinga `ordem desc` puro de `data desc,
ordem desc` — ou todas as provas passariam com as duas? o conjunto dos estornáveis é idêntico antes e depois,
ativo a ativo? a linha do tempo e a lista continuam sendo servidas por índice, ou viraram Sort? a sequência ficou atrás do `max(ordem)`, de forma que o primeiro INSERT
depois do deploy viola o único? a janela `estoque.dev_destrutivo` ficou contida na transação, e há prova de
que ela fechou? a trava do estorno passou a decidir por `ordem` **e** tem cenário que só passa por causa
disso? algum roteiro passou a contar sobre conjunto vazio? alguma mutação existente deixou de PEGAR depois
das recriações? o diff das funções recriadas é só o desempate? algum arquivo fora do escopo foi tocado —
`paginarTodos`, `lancamentos_item`, os índices, a fila pendente? **Aponte apenas lacunas de correção ou de
requisito declarado — não preferências de estilo.** Corrija e re-revise até limpar.

# Relatório final
`docs/RELATORIO-F53.md`, em pt-BR, no padrão dos relatórios F45→F52: o que mudou por arquivo e por quê; **os
números MEDIDOS** (linhas de `movimentacoes`, linhas com data retroativa, contagens antes/depois, asserções
por roteiro antes/depois, mutações antes/depois, `idx_scan` dos três índices) lado a lado com o que a ficha
previa, e **cada divergência explicada** — a começar pelas cinco já conhecidas; as **dez decisões** com o
custo que decidiu cada uma; as **quatro sabotagens** com saída real; as 12 datas de amostra antes e depois,
nos dois ambientes; o diff da `0134` mostrando que só o desempate mudou; os 21 critérios autoverificados; e
uma seção explícita **"o que este relatório NÃO prova"** — no mínimo: que a equivalência foi provada sobre o
acervo de hoje, não sobre todo acervo possível; **que a comparação das 12 datas passa com qualquer uma das
três réguas da Decisão 3, e portanto não a decide — quem decide é o cenário (f)**; que a asserção de
equivalência é quase tautológica no dia em que roda e vale como regressão daí em diante; que o roteiro
exercita os cenários que ele mesmo monta, não os 13 meses; e o que ficou sem prova por causa do ensaio. Pendências (a fila `0129`→`0132`, com a ordem correta; o `database.ts`, se não houve apply)
e **backlog nomeado para a F60** (o cursor está pronto; o `cap` de `paginarTodos`; o `idx_scan` medido do
`movimentacoes_ordem_lista_idx`, que é o insumo de aposentá-lo), **para a F65** (`(empresa_id, ordem)`) e
**para quem for mexer em `lancamentos_item`** (a `0127:126` e a `v_conflitos_filiais`, se ela não entrar).
**Evidências, não afirmações:** saída real e completa dos comandos. Termine a resposta final com um resumo de
5 linhas em pt-BR.

# Idioma
Narrativa, plano, ata, relatório, comentários de código, comentários de migration, mensagens de erro,
`comment on column` e commits em **pt-BR**. Identificadores de domínio em português sem acento
(`movimentacoes.ordem`, `movimentacoes_ordem_uidx`); utilitários e infra em inglês. As mudanças do
`registry.ts` em LINGUAGEM DE OPERADOR — há teste que recusa 21 termos de desenvolvedor, entre eles
"migration", "policy", "schema", "deploy" e "RPC".
```

---

## Como executar

### Pré-voo (uma vez, ~15 minutos)

```powershell
cd C:\Users\victor.matusita\ti-wap-inventory-control   # na outra máquina: C:\Users\yukig\...
git checkout main; git pull
npm ci

# 1. A linha de base tem de estar VERDE antes de começar.
npm run lint; npm run test; npm run build; npx tsc --noEmit

# 2. O gh EXISTE (F45 §15) — só pode não estar no PATH desta sessão.
& "C:\Program Files\GitHub CLI\gh.exe" auth status

# 3. Confirme onde a F52 parou: 1.57.0 no package.json, última migration 0132.
type package.json | findstr version
dir supabase\migrations | findstr 013

# 4. A versão do Claude Code (o modo `auto` exige 2.1.83+).
claude --version
```

**⚠ O passo que só você pode dar: reative o projeto de ENSAIO** (`sgmvldiizsrjbxzzpmhh`). Ele estava
**INACTIVE** na F50, o `restore` é **recusado pelo classificador** do modo automático (tentado nas F36 e F37),
e esta mesa não tem `psql`, Docker nem Supabase CLI. Esta fase escreve na tabela mais protegida do sistema
com a guarda desarmada: **ensaiar primeiro é a diferença entre reversível e assustador**. Abra o painel do
Supabase, restaure o ensaio e confirme que ele responde antes de colar o prompt.

**Conecte o MCP do Supabase antes de colar.** Sem ele não há apply, não há captura do "antes" em produção e
não há comparação das 12 datas — a fase entrega repositório e deixa tudo pendente. A F51 registrou por escrito
que a ausência dele *"não é azar de sessão: qualquer sessão futura esbarra no mesmo gate"*.

Dentro do Claude Code, antes de colar: `/permissions` (confira que `Bash(git push*)` não está negado — a fase
abre PR e publica tag) e `/memory` (o `CLAUDE.md` do projeto tem de estar listado).

### Rodar

```powershell
claude --model opus --permission-mode auto -n f53
# cole o bloco do prompt inteiro e deixe rodando
```

Modo `auto` é o certo: a fase roda `npm ci`, `npm run db:lock`, `gh pr create`, `git tag`/`push` e apply por
MCP — nada disso passa numa allowlist estreita, e nada disso é ação que o classificador bloqueia. O que ela
**não** faz (push forçado, reset destrutivo, editar migration aplicada, roteiro que escreve contra produção,
mexer na proteção da `main`) está no escopo negativo do prompt.

⚠ **O gate NÃO deveria disparar nesta fase** — as duas migrations não contêm `delete from public.ativos` nem
`delete from public.movimentacoes`. Se disparar, é informação nova sobre o classificador, e o prompt manda
cair no handoff em `scratchpad/` e seguir.

Opcional, e recomendado para desatendido — a condição de parada como avaliador separado:

```
/goal npm run lint, npm run test, npm run build e npx tsc --noEmit passam limpos; as migrations 0133 e 0134
existem com db:lock rodado; count(*) de movimentacoes e identico antes e depois e count(ordem)=count(*); a
assercao de equivalencia total tem zero divergencias; rel_estoque_asof e identica em 12 datas antes e depois;
asof_desempate.sql tem cenario de par compra+ajuste, de estorno da penultima e de movimentacao retroativa; o
conjunto dos estornaveis e identico antes e depois; npm run db:test e db:test:mutations verdes; e o PR esta
mergeado com verificar e banco-sem-docker verdes
```

Sem colidir com trabalho local: `claude --worktree f53 --model opus --permission-mode auto` (aceite o diálogo
de confiança uma vez, antes).

### Enquanto roda

```powershell
& "C:\Program Files\GitHub CLI\gh.exe" run watch
& "C:\Program Files\GitHub CLI\gh.exe" run view --log-failed
```

Cinco momentos para acompanhar:

1. **A captura do "antes" em produção.** Ela tem de acontecer **antes** de qualquer DDL. Se o agente aplicar
   a `0133` e só depois pensar na comparação, a prova central da fase morreu — e não dá para refazer.
2. **As Decisões 3 e 4 — as duas que quebram em silêncio.** A 3: se ele trocar `data desc, created_at desc,
   …` por `ordem desc` puro no `rel_estoque_asof`, todo ativo com movimentação lançada com data retroativa
   passa a resolver diferente em relatório de período passado. A 4: se ele trocar a trava do estorno por
   `ordem` sem comparar o conjunto dos estornáveis, muda **o que pode ser desfeito** em produção. Nenhuma das
   duas aparece nas 12 datas — procure, nas atas, o cenário retroativo e a comparação dos estornáveis.
3. **A sequência depois do backfill.** Se ela ficar atrás do `max(ordem)`, o sintoma não aparece no apply:
   aparece na **primeira movimentação registrada depois do deploy**, como violação do índice único, na cara do
   operador. Confira o `setval`/`restart` na ata e no roteiro.
4. **A sabotagem B ficando VERDE.** Se devolver `id desc` ao desempate não derrubar nada, o roteiro não monta
   um empate de verdade — e a fase inteira estaria provando o caso fácil. O prompt manda tratar isso como
   achado, não como sucesso. O empate honesto é o par compra+ajuste do import, **não** o lote da F38 (que não
   repete ativo).
5. **A trava de merge.** Se o apply não acontecer, a Frente C (o app lendo `ordem`) não pode subir para a
   `main`: sem a coluna no banco, a lista e a linha do tempo devolvem `42703`. Confira, no PR, que o que
   subiu é coerente com o que foi aplicado.

### Ao voltar

1. Leia as **dez atas** em `docs/DECISOES.md`. A **3** (a régua do as-of) e a **4** (a semântica das travas
   de escrita) são as que podem mudar comportamento em silêncio; a **8** (o índice) e a **10** (a forma da
   trava) são as que mais decidem o custo da F60.
2. `git diff main...f53-ordem-das-movimentacoes -- supabase/migrations/` deve mostrar **exatamente** a `0133`,
   a `0134` e o `migrations.lock.json`. Qualquer migration antiga tocada = a fase quebrou a regra mais dura do
   repositório.
3. Abra `docs/f53-evidencias/` e confira **com os olhos** as 12 datas antes e depois, nos dois ambientes.
   É a prova de que nenhum número histórico mudou, e ela é a razão de existir desta fase.
4. Entre em `/movimentacoes` e na ficha de um ativo **vindo do import de abertura** (é lá que o empate mora).
   A linha do tempo tem de sair estável e na ordem em que as coisas aconteceram. Recarregue duas vezes: a
   ordem não pode mudar entre recargas. **É a verificação humana que nenhum roteiro faz.**
4-bis. Registre, no ensaio, uma movimentação com **data retroativa** num ativo que já tenha movimentação de
   hoje, e olhe a lista, a linha do tempo e um relatório de período que a inclua. É o caso que a Decisão 3
   decide, e é o único que os números do acervo atual não conseguem mostrar.
5. Rode um estorno de teste no ensaio: estornar a última tem de funcionar; estornar a penúltima tem de ser
   recusado com a mensagem de sempre.
6. Rode a **verificação pós-apply** do runbook em produção e confirme `notify pgrst, 'reload schema';` — a
   tabela ganhou coluna, e sem o reload a API não a enxerga.
7. Rode você mesmo `npm run test` e `npm run build` uma vez.
8. Veio errado? **Regra dos 2 strikes:** depois de duas correções falhas, não emende a sessão — peça um prompt
   novo com o aprendizado e rode em sessão limpa. A reversão desta fase é de minutos: `drop column ordem
   cascade` e reemitir os corpos anteriores, que estão no git.

---

## Suposições que fiz

1. **F53 é a próxima fase e a F52 está fechada no repositório**: `package.json` em `1.57.0`, última migration
   `0132`, PR #35 mergeado. Se você tiver rodado alguma correção avulsa (PATCH) depois, o agente recalcula a
   versão pelo `package.json` — o prompt manda medir, não confiar no número escrito aqui.
2. **As migrations são a `0133` (coluna + backfill) e a `0134` (o desempate)**, e a versão é a **1.58.0**. A
   ficha diz `0132`/`0133` porque foi escrita antes da F51 e da F52 consumirem dois números.
3. **A fila `0129`→`0132` fica de fora** — sua escolha nesta conversa. O prompt manda conferir o estado real,
   não aplicar nenhuma delas e repetir a pendência no relatório com a ordem correta. Se você aplicá-las antes
   de rodar, nada muda para esta fase: ela não depende de nenhuma.
4. **O agente aplica em ensaio E produção**, sua escolha nesta conversa. Escrevi o apply como uma sequência
   com ponto de parada explícito: a captura do "antes" vem primeiro, a contagem depois da `0133` é o gatilho
   de reversão, e divergência nas 12 datas é reversão, não conserto. Se você preferir ficar com a produção na
   mão, é uma linha a acrescentar ("não aplique em produção; deixe o handoff em `scratchpad/`").
5. **O TypeScript entra**, sua escolha nesta conversa — as duas leituras que usam a tripla. As **três**
   leituras "qual foi a última" (`:165`, `:200`, `:268`) ficaram como decisão do agente, uma a uma, porque
   nenhuma delas está na ficha e cada uma alimenta uma tela diferente. Se quiser as três dentro ou as três
   fora, é uma linha.
6. **Os índices existentes ficam.** `movimentacoes_ordem_lista_idx` provavelmente fica sem uso depois desta
   fase, mas quem decide aposentá-lo é a F60, que vai desenhar a paginação — o prompt manda **medir**
   `idx_scan` e deixar o número no backlog. Se você quiser dropá-lo aqui, é uma linha (e uma reversão a mais).
7. **`v_conflitos_filiais` ficou como decisão do agente**, não como entrega. Ela tem o mesmo defeito (o
   `ultima_mov_tipo` sem desempate), custa uma linha, e está fora da ficha — deixei a medição ("a view é lida
   em ponto onde o empate apareceria?") decidir, em vez de mandar ou proibir.
8. **`lancamentos_item` ficou inteiramente fora.** A `0127:126` tem a mesma classe de defeito, mas dar `ordem`
   a ela é outra coluna, outro backfill e outra janela — e a ficha não pede. Vai nomeada no backlog.
9. **Assumi que a diferença entre `ordem` e `data` importa, e NÃO deixei a contagem decidir.** É o ponto em
   que este prompt vai além da ficha por conta própria: `dataNaoFuturaSchema` deixa lançar movimentação com
   data retroativa, e por isso `ordem desc` puro não é substituto neutro de `data desc, …` no as-of. Zero
   linhas retroativas em 13 meses **não** tornaria a decisão trivial: o risco é do primeiro lançamento
   retroativo depois do apply, não do acervo atual. Por isso a Decisão 3 exige uma asserção que distinga as
   réguas (o cenário f), e não só a contagem. Se você tiver preferência entre (a) e (b), é uma linha a
   acrescentar no prompt — e vale a pena tê-la, porque a régua de precedência ("vale a ficha") empurra o
   agente para (b).
10. **Esta ordem passou por revisão adversarial antes de chegar a você**, e a revisão achou um erro de fato
   que já está corrigido aqui: a versão anterior dizia que o lote da F38 grava duas movimentações do mesmo
   ativo, e ele **não** grava — a action recusa ativo repetido. O empate do mesmo ativo vem do import de
   abertura. A revisão também trouxe o gêmeo `apagar_movimentacao`, os dois despejos de backup, as nove
   entradas de índice e as quatro armadilhas de sequência/plan cache, que viraram texto no prompt.
11. **`apagar_movimentacao` ficou como decisão, não como entrega.** Ela tem a mesma comparação da trava do
   estorno, mas o corpo dela contém `delete from public.movimentacoes` — trazê-la para dentro da `0134` faria
   a migration bater no gate e levaria junto o apply automático das outras duas. Por isso o prompt manda
   isolá-la numa `0135` pelo caminho B, se ela entrar. Se você preferir deixá-la inteiramente para outra
   fase, é uma linha.
