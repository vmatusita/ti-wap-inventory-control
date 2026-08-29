# RELATÓRIO F38 — Os itens andam com o ativo

> Ordem: `docs/prompts/F38-itens-andam-com-o-ativo-ultracode.md` (28/08/2026) ·
> Versão: **1.43.0** · Migrations **`0116`–`0122`** ·
> Roteiro novo: `supabase/tests/f38_itens_com_ativo.sql` (48 asserções, 0 falhas).

## 1. O que faltava, em uma frase

O acessório e o equipamento viviam em dois mundos que não se falavam: `lancamentos_item` não tinha
elo nenhum com `movimentacoes`, não existia conta por pessoa, o checklist de devolução eram sete
códigos fixos no código que não tocavam o estoque, e o lote de movimentação commitava linha a linha.

## 2. A curva, primeiro — e ela mudou uma conclusão da F37

A frente 0 era a pendência nº 1 da F37 e foi a **primeira coisa executada**, antes de qualquer
migration. O ensaio (`sgmvldiizsrjbxzzpmhh`) declara `desenvolvimento` em `public.ambiente`, e as
três funções medidas tinham **md5 idêntico** ao de produção — a medida é transferível.

### 2.1 A primeira execução, e o achado que ela produziu ao ser interrompida

A primeira corrida usou o método padrão (trigger de validação LIGADO durante a população, o que a
ordem chama de "medir o custo real"). Ela chegou a **126.020 linhas** e foi interrompida de
propósito. O que ela mediu — e este número é um entregável, não um fracasso:

| relógio | linhas no minuto | total acumulado |
|---|---|---|
| 22:33 | 10.000 | 10.000 |
| 22:37 | 22.000 | 44.020 |
| 22:38 | 38.000 | 82.020 |
| 22:41 em diante | **2.000** | 106.020 … |
| 22:47→22:49, 22:51→22:53 | **2.000 a cada 2 minutos** | 126.020 |

Um lote de 2.000 linhas passou de **~6 s** no começo para **~60–120 s** aos 126 mil. Extrapolando,
os 500 mil levariam **mais de 8 horas** por esse caminho. **É o achado:** popular com o trigger
ligado é inviável nesse patamar, e a ordem previa exatamente isso ("se um patamar ficar inviável,
isso é o achado").

O ensaio foi limpo à mão, na janela `estoque.dev_destrutivo`, e **conferido**: 23 lançamentos e 6
itens antes, 23 e 6 depois, 0 linhas marcadas.

### 2.2 A execução completa — os três patamares

Relançada com `MEDIR_ITENS_DESLIGAR_TRIGGER=sim` (a opção que o próprio harness documenta para
isto). População: 10 mil em **8,7 s**, +90 mil em **75,7 s**, +400 mil em **316,7 s**. A medida do
custo por INSERT do trigger continua sendo feita **com ele ligado** — é a medida 3, e é a que
importa.

JSON: `docs/perf/f38-itens-ensaio.json`.

| medida | 10 mil | 100 mil | 500 mil |
|---|---:|---:|---:|
| `rel_saldo_itens` (consolidado) | 19,8 ms | 170,2 ms | 807,6 ms |
| `rel_saldo_itens` (uma filial) | 12,5 ms | 80,6 ms | 386,1 ms |
| `rel_mov_itens` (30 dias) | 16,3 ms | 114,6 ms | 1031,9 ms |
| **trigger `valida_lancamento_item`, por INSERT no par quente** | **3,3 ms** | **3,3 ms** | **3,5 ms** |
| histórico paginado, 1ª página | 20,7 ms | 151,7 ms | 708,1 ms |
| histórico paginado, última página | 47,1 ms | 366,3 ms | 2653,7 ms |

⚠ **O custo por INSERT do trigger é PLANO.** A F37 previu, LENDO O CÓDIGO, um driver quadrático: o
trigger agrega todo o diário do par a cada INSERT. Em campo isso **não se materializa** — 3,3 ms aos
10 mil e 3,5 ms aos 500 mil, num par quente que chegou a 75 mil linhas. A razão é
`lanc_item_item_filial_idx (item_id, filial_id, data)`, que já serve a agregação: o trigger varre o
índice do par, não a tabela. A leitura de código estava certa sobre a forma da consulta e errada
sobre o custo — e só a medição podia dizer isso.

Limpeza conferida ao fim: `Contagem DEPOIS (linhas marcadas PERF-F37): lancamentos_item=0, itens=0`.

### 2.3 O que a curva decidiu: o índice ENTRA (migration `0120`)

A curva dos três patamares mede as leituras que **já existiam**. Para decidir o índice de saldo por
pessoa foi preciso medir a leitura **nova** — e isso foi feito com uma segunda população dirigida
(marcador `PERF-F38`, 500.000 lançamentos com `colaborador_id` espalhados por 200 pessoas × 100
itens × 5 filiais), com e sem o índice, no mesmo par:

| | sem índice | com índice | |
|---|---:|---:|---|
| `rel_saldo_colaborador(uuid)` | **111,56 ms** | **9,22 ms** | **12,1× mais rápido** |
| INSERT com `colaborador_id` | 2,64 ms | 2,83 ms | +0,19 ms (+7,2%) |
| buffers para devolver 250 linhas | 9.833 | 869 | 11× menos |
| tamanho | — | 5,5 MB sobre 71 MB de tabela | 7,7% |

**Veredito, com o número na mão:** o índice entra. `rel_saldo_colaborador` é a única consulta do
sistema que filtra `lancamentos_item` por `colaborador_id` **sem** o par (item, filial); nenhum
índice existente a serve. E ela está no caminho de escrita, não só de leitura: a action consulta o
saldo da pessoa antes de gravar o `retorno`, para decidir o vínculo (§C.3).

**E o que a curva decidiu NÃO fazer:** nada além disso. Nenhum saldo materializado, nenhum cache,
nenhuma paginação nova — o número desaconselha, não só a ordem proíbe.

Segunda limpeza, também conferida: 23 lançamentos, 6 itens, 0 colaboradores, 0 linhas `PERF-`.

## 3. Baseline, medida antes de qualquer mudança

```
npm run lint    limpo
npm run test    132 arquivos · 2663 testes · 0 falhas
npm run build   limpo
```

Produção em 28/08/2026, antes: 1615 ativos · 3430 movimentações · 30 lançamentos de item · 18 itens ·
17 pendências de item · 0 colaboradores · 7 tipos de item · 6 filiais.

## 4. O critério 5, provado: nenhum número mudou

Total / Estoque / Atrelados / Falta por item×filial, lidos de `rel_saldo_itens` em produção **antes**
e **depois** do apply das seis migrations. As 18 linhas com saldo voltaram **idênticas, uma a uma**.

| filial | item | Total | Estoque | Atrelados | Falta | liberados derivado |
|---|---|---:|---:|---:|---:|---:|
| 1 | Fone WaaW Energy10 | 41 | 33 | 1 | 0 | 7 |
| 1 | Mochila | 65 | 65 | 0 | 0 | 0 |
| 1 | Teclado Logitech usado | 4 | 3 | 0 | 0 | 1 |
| 1 | Mouse Logitech usado | 4 | 4 | 0 | 0 | 0 |
| 1 | KIT Logitech | 18 | 18 | 0 | 0 | 0 |
| 1 | KIT Dell | 31 | 29 | 0 | 0 | 2 |
| 1 | Teclado Lehmox | 15 | 15 | 0 | 0 | 0 |
| 1 | Mouse Lehmox | 3 | 3 | 0 | 0 | 0 |
| 1 | Mousepad | 32 | 27 | 0 | 0 | 5 |
| 1 | SSD 128GB · SSD 256GB · DDR4 4/8/16GB · DDR5 8/16GB · DDR3 4GB · DDR4 8GB Desktop | 1·6·18·8·3·1·4·1·1 | idem | 0 | 0 | 0 |

**Total da TI por filial** (a prova do §E — só muda quando alguém der `baixa` numa pendência depois
do deploy, e aí muda de propósito):

| filial | Total | Estoque | Liberados | ativos |
|---|---:|---:|---:|---:|
| 1 · Matriz | 256 | 240 | 15 | 1140 |
| 2 · CD Afonso Pena | 0 | 0 | 0 | 199 |
| 3 · Linhares | 0 | 0 | 0 | 161 |
| 4 · Serra | 0 | 0 | 0 | 57 |
| 5 · Eusébio | 0 | 0 | 0 | 58 |
| 6 · Nova teste | 0 | 0 | 0 | 0 |

Contagens de fechamento: 1615 ativos · 3430 movimentações · 30 lançamentos · 17 pendências —
**iguais à baseline**. E `linhas com vínculo novo = 0`: nenhum registro histórico foi tocado.

## 5. O critério 9, provado por md5 em produção

As dez funções que a fase prometeu não tocar, conferidas por `md5(pg_get_functiondef(...))` **antes e
depois** do apply em produção. Todas idênticas:

```
aplicar_movimentacao                    d2010a896dabc442a04cfe2f72c7b068  ✓
criar_compra_lote                       58533fd3d3011eb527065c9660c847a1  ✓
devolver_ao_fornecedor                  a7641d50a19e252141fc762117b687e2  ✓
guarda_acervo                           0829c62705d936370e95eb6e42b67c4f  ✓
rel_estoque_asof                        817f81d9f52b7694f2c1ae48899bc6f8  ✓
rel_mov_itens                           02cfff1692e6549fd983036637300cf2  ✓
rel_saldo_itens                         552a9f0b9a2527cadd62770d2d1a90d2  ✓
status_apos_movimentacao                69a73abfcfe13d7b2560bb6908c09a72  ✓
status_tem_detentor                     551c37d163ecd06fbf9c70fdb7f6945b  ✓
transferir_item                         da0a511f3f57e11017a43be46ffa4b72  ✓
```

⚠ **`aplicar_movimentacao` É o trigger da `0051`.** A ordem lista os dois como intocáveis; são a
mesma restrição, e um md5 prova as duas promessas.

A **única** função existente recriada foi `valida_lancamento_item`, sobre o corpo **lido do banco**
(`90f5c1bb63d215f196da4e2a7e9d87f0` → novo), com **um** bloco acrescentado.

`tipo_lancamento` continua com os mesmos 6 valores: `entrada, saida, reserva, liberacao, ajuste,
retorno`. **Nenhum enum novo.** As cinco funções novas são todas `security invoker`
(`prosecdef = false`), e por isso **nenhuma delas aparece** nos advisors de segurança — que voltaram
exatamente os mesmos avisos pré-existentes de antes da fase.

## 6. A aritmética do §E, conferida contra o cabeçalho da `0027`

```
total     = max(0, Σentrada + Σajuste)
atrelados = Σ_chamado max(0, Σreserva − Σliberacao)
liberados = max(0, Σsaida − Σretorno)
estoque   = max(0, total − atrelados − liberados)
falta     = max(0, atrelados + liberados − total)
```

| Desfecho | Lançamentos | total | atrelados | liberados | estoque | com_a_pessoa |
|---|---|---|---|---|---|---|
| `recuperado` | `retorno` 1 | `=` | `=` | `−1` | **`+1`** | **`−1`** |
| `baixa` | `retorno` 1 **+** `ajuste` −1 | **`−1`** | `=` | `−1` | `+1−1 =` **`=`** | **`−1`** |

**Por que a baixa são dois lançamentos:** `ajuste` não entra em `Σsaida − Σretorno`. Um ajuste
negativo sozinho tiraria do Total e deixaria o item na conta da pessoa **para sempre** — o furo exato
que esta frente existe para fechar. Provado no roteiro (cenários 7 e 8) com os números nas duas
pontas.

**A partição da §C:** `Σ_C com_a_pessoa(C) + (sem vínculo) = Σsaida − Σretorno`, que é o `liberados`
antes do `max(0, …)`. `rel_saldo_colaborador` **não** aplica o `max` de propósito: numa parcela,
zerar por baixo esconderia anomalia e quebraria essa identidade. O cenário 4 do roteiro a prova por
asserção.

## 7. As provas executáveis

### 7.1 O roteiro novo — 48 asserções, 0 falhas

`supabase/tests/f38_itens_com_ativo.sql`, rodado no ensaio — **45 asserções, 0 falhas**:

| # | o que prova |
|---|---|
| 0 | âncora: as leituras enxergam as entradas (sem ela, os casos abaixo comparariam zeros) |
| 1a–1e | o vínculo (D13), `ativo_id` NÃO existe, o avulso continua nulo, a FK é imediata |
| 2a–2c | **tudo-ou-nada**: lote com uma linha inválida grava 0 movimentações e 0 lançamentos |
| 3a–3d | as travas em ordem determinística e antes do primeiro INSERT, com o carrinho invertido |
| 4a | a identidade do critério 5 |
| 5a–5b | a guarda nova recusa acima do saldo da pessoa, e aceita dentro dele |
| 6a–6b | `retorno` **sem** pessoa continua passando, e não tira da conta de ninguém |
| 7a–7d | `recuperado`: estoque +1, pessoa −1, Total inalterado |
| 8a–8c | `baixa`: dois lançamentos, Total −1, estoque de volta, pessoa −1 |
| 9a–9d | reabrir sem os inversos RECUSA; com eles, fecha o ciclo |
| 10a–10c | o "Faltante" byte a byte, e a ponte tipo→item resolvendo |
| 11 | grants das quatro RPCs e o `security invoker` das cinco funções novas |
| 12a | idempotência: reenviar não re-resolve nem duplica lançamento |
| 13a–13c | o estorno desfaz o conjunto, ou recusa |
| 15 | reabrir uma BAIXA com os inversos na ordem PIOR (a correção da 0122) |
| 14, 14a, 14b | nenhuma das 10 funções intocadas carrega marca da F38 (com contraprova na que FOI recriada), e nenhum enum novo |

### 7.2 Todos os roteiros (regra F17)

Rodados no ensaio depois da recriação de `valida_lancamento_item`:

```
cargo_dev.sql              ok=46  falhas=0
conflito_filiais.sql       ok=38  falhas=0
dev_destrutivo.sql         ok=108 falhas=0
f38_itens_com_ativo.sql    ok=48  falhas=0
papeis_rls.sql             ok=74  falhas=0
transferencia_item.sql     ok=18  falhas=0
f37_colaboradores_tipos.sql ok=25 falhas=1  (ver 7.3)
```

Os demais roteiros não têm tabela de resumo — usam só `NOTICE`, que o MCP engole. **A prova deles é
o job `banco` do CI**, como o runbook determina.

### 7.3 A falha `i1` do `f37_colaboradores_tipos.sql` NÃO é regressão desta fase

A asserção exige 0 slugs órfãos entre `movimentacoes.itens_faltantes`/`pendencias_item.item` e
`tipos_item`. No ensaio ela acusa 41 órfãos — **todos do seed FICTÍCIO**, com grafias que o catálogo
não tem (`Mochila`, `mouse pad`, `Sem Carregador`, `MousePad`, `Monitor`). Medido em produção no
mesmo instante: **0 órfãos**. E no Postgres novo do CI a tabela nasce vazia. A F38 não tocou nada
disso. Fica registrado como pendência (§10).

### 7.4 Um defeito de OUTRA fase, achado e consertado de passagem

Dez roteiros escolhiam o perfil-autor com `select id into v_prof from public.profiles limit 1` —
**sem `order by` e sem filtro**. No ensaio isso caía num perfil `ativo = false` sobrado de um E2E da
F31, e `papel_atual()` devolve NULL para perfil desativado desde a `0070`: `import_substituir.sql` e
`troca.sql` morriam com `42501 Apenas administradores podem executar o import`, num roteiro que
passava verde ontem. É a **mesma classe de não-determinismo** da pendência nº 5 da F37, só que em
quem o roteiro escolhe como autor. Corrigido nos dez: `where ativo and excluido_em is null order by
created_at, id limit 1`. Depois disso, os dois rodam.

## 7.5 A revisão adversarial — 6 lentes, cético por cima, 5 achados confirmados e corrigidos

Seis lentes independentes em contexto fresco (a ordem cumprida ao pé da letra ·
concorrência e travas · a aritmética · regressão no fluxo que já existia · modelo de
acesso · as provas provam o que dizem?), cada achado julgado por um cético instruído
a **refutar por padrão**. Cinco sobreviveram, e três quebravam comportamento — não
desenho. Todos corrigidos, com prova nova onde faltava.

| # | onde | o defeito | a correção |
|---|---|---|---|
| 1 | `0119` | reabrir uma `baixa` podia FALHAR: os dois inversos são ambos positivos e o `case` não os desempatava | migration **`0122`** ordena pelo EFEITO + cenário **15** do roteiro, que manda os inversos na ordem PIOR |
| 2 | `actions/itens.ts` | o carrinho avulso gravava `colaborador_id` em `retorno` sem a §C.3 — e a guarda nova recusava uma devolução que funcionava | passou a usar `decidirVinculoRetorno`, como a movimentação |
| 3 | `nova-movimentacao-form.tsx` | remover um ativo do lote deixava o periférico apontando o equipamento errado (índice por posição) | `remover` reajusta `itensJunto` |
| 4 | `itens-do-lote.ts` | checklist num lote MISTO repunha na filial errada e baixava da conta de quem não devolveu | `checklistPodeLancar` — lote misto não gera lançamento, e a tela avisa |
| 5 | `rascunho.ts` | o rascunho voltava perdendo os itens do lote, sem avisar | os dois campos passaram a ser saneados |

E um sexto, que era só texto mas carregado: o comentário da `0117` dizia "advisory
primeiro, ativos depois" e o corpo faz o **oposto**. O código estava certo (e a
`0121` concordava com ele); o risco era alguém "consertar" o código para casar com o
comentário e reintroduzir a inversão de ordem que a `0100` já pagou em produção. O
texto foi corrigido, com o aviso de que quem mexer numa mexe nas duas.

⚠ **O achado nº 4 é o que mais ensina:** a verificação em tela desta mesma fase, que
tinha acabado de encontrar dois outros furos, **não o pegou** — porque foi feita com
um ativo só no lote. Percorrer a tela prova o caminho que se percorre; a lente
adversarial pergunta pelos que não se percorreu.

Depois das cinco correções: `lint` limpo, **2740 testes** (eram 2663 na baseline),
`build` limpo, roteiro F38 com **48 asserções e 0 falhas**, e todos os roteiros
rodados de novo no ensaio.

## 8. Rollout

1. **Banco pelo caminho A** — ensaio primeiro (`0110`…`0115` para pôr o ensaio em dia, depois
   `0116`…`0121`), todos os roteiros lá, `get_advisors`, e só então produção via
   `apply_migration`, seguido de `notify pgrst, 'reload schema'`.
2. **Conferência pós-apply em produção:** colunas `movimentacao_id` e `pendencia_item_id` (uuid,
   anuláveis); as duas FKs **não** deferrable; os três índices (`lanc_item_mov_idx`,
   `lanc_item_pendencia_idx`, `lanc_item_colaborador_idx`); as cinco funções com a assinatura
   prevista e `prosecdef = false`; os grants como o desenho previu.
3. **`get_advisors`**: nenhum aviso novo. Os 30 existentes são pré-existentes (funções
   `security definer` de fases anteriores e a proteção de senha vazada do Auth).
4. **Ordem migration → deploy** respeitada: o SQL entrou antes do deploy, porque o código novo lê
   coluna e chama RPC que só existem depois dele.

## 8.5 Contagens de fechamento e smoke pós-deploy

Lidas de produção **depois** de todas as sete migrations e do deploy final:

```
acervo                              1615 ativos · 3430 movs · 30 lancs · 17 pendencias
                                    (IDÊNTICO à baseline)
Total da TI por filial              1:256 | 2:0 | 3:0 | 4:0 | 5:0 | 6:0
                                    (IDÊNTICO à baseline)
colunas/RPCs da fase                2 colunas · 5 RPCs
a 0122 pegou?                       sim
funções intocadas ainda byte a byte 10 de 10
```

**Smoke pós-deploy** (`scripts/smoke/smoke-prod.mjs`, sessão real): **102 OK · 1
aviso · 1 n/a · 0 falha**.

- O aviso é **pré-existente e alheio à fase**: `kits_modelos · anon NÃO lê (RLS)` —
  não há kit cadastrado, então a RLS não se comprova. Está assim desde a F37.
- O `n/a` é a checagem nova `rel_saldo_colaborador · a conta por pessoa (F38)`:
  produção tem **zero colaboradores cadastrados** (herdado da F37 — a fila de 903
  nomes ainda espera alguém consolidar), então não há pessoa para consultar. A
  checagem responde `n/a` de propósito, em vez de falhar.
- A checagem nova do vínculo respondeu: `shape ok · 0 lançamento(s) com vínculo de
  movimentação` — exatamente o esperado logo após o deploy: nenhum registro histórico
  foi tocado.

**Deploy:** `dpl_8SkQBsWFchx4oxory19rrR53rqes`, **READY**, commit `444ea3c`,
região `gru1`.

**Tag:** `v1.43.0` anotada, publicada, apontando para `444ea3c` — o commit
efetivamente deployado. (Ela chegou a ser criada em `7d5314c` e foi recriada no
commit final depois das correções da revisão; a tag deve marcar o estado final da
versão, não um intermediário.)

**CI:** verde nos dois jobs (`verificar` e `banco`) no commit final.

## 9. Decisões desta fase (atas completas em `docs/DECISOES.md`, 2026-08-28)

1. **O lote é tudo-ou-nada, e o "painel de sucesso parcial" não era o que a ordem supunha.** A
   leitura mostrou que o sucesso parcial do lote **nunca passou** por `painel-sucesso.tsx` — ele só
   é montado no sucesso TOTAL. O caminho parcial era `nova-movimentacao-form.tsx:1035-1076`: volta ao
   passo 2, `errosPorAtivo`, chips "Já registrados" e o toast "N registrada(s); M falhou(aram)". Foi
   ESSE caminho que foi reescrito, e `jaRegistrados` foi removido inteiro — não há mais o que ele
   mostrava.
2. **A RPC trava DUAS classes, não uma.** A ordem nomeia as advisory locks. A transacionalidade cria
   uma segunda: `aplicar_movimentacao` faz `select … for update` no ativo, e hoje esses row locks
   nunca coexistem porque cada INSERT é uma transação. Numa transação só, o lote segura N deles — e
   dois lotes com ativos em ordens diferentes deadlockariam. A RPC trava os ativos, ela mesma, em
   ordem crescente de `id`, antes de tudo.
3. **A filial vem do ativo lido sob a trava, não do payload.** Entre a leitura da action e o INSERT o
   ativo pode ter sido transferido. Numa transação única isso deixou de ser aceitável em silêncio.
4. **O vínculo condicional do retorno (§C.3)** — decisão da ordem, implementada em
   `src/lib/itens/vinculo-retorno.ts`: o `retorno` só carrega `colaborador_id` quando a pessoa tem
   saldo suficiente daquele item naquela filial. Sem saldo, grava sem vínculo. Isso é o que faz
   "entrega antiga funciona igual" (D12) conviver com a guarda nova.
5. **A ponte tipo→item, e o que o modelo NÃO suporta.** A ordem fala em "item de catálogo ativo
   naquela filial". `itens` é catálogo **global** e `tipos_item` **não tem `filial_id`** — os
   candidatos são os mesmos em toda filial. A regra implementada: um candidato resolve, zero ou mais
   de um não bloqueia/pergunta, e a filial entra como informação no combobox, não como filtro.
6. **A `baixa` são dois lançamentos**, conferido contra a `0027` (§6 acima).
7. **Nasce `lancamentos_item.pendencia_item_id` (`0119`).** O critério 8 exige que reabrir grave os
   inversos "ou recuse — nunca deixa lançamento órfão". Sem elo, descobrir qual lançamento veio de
   qual pendência seria adivinhação por texto (duas pendências da mesma devolução têm o MESMO
   `movimentacao_id`). Com ele, a recusa é provada **dentro da transação, pelo banco**.
8. **`0120` e `0121` são migrations a mais do que a ordem nomeou.** A ordem lista `0116`–`0119`; o
   índice depende da curva (e por isso não podia estar nas quatro), e o estorno acoplado (§B.5)
   precisa de uma RPC própria. Migration nova é o caminho limpo — editar uma já aplicada, não.
9. **`p_observacao` corrigido à mão em `database.ts`.** O gerador de tipos perde `| null` (defeito
   conhecido, registrado na memória do projeto): duas assinaturas foram corrigidas depois de
   `db:types`, e o diff foi conferido para não conter mais nada.
10. **Dois testes existentes mudaram, os dois por decisão explícita da ordem:** o título do manual
    "…e sucesso parcial" (§B.2 o extinguiu) e a asserção que travava o rótulo `"Itens faltantes na
    devolução"` (a §D mudou o rótulo junto com o que o checklist faz). **Nenhum outro.**

## 10. Pendências que esta fase deixa nomeadas

1. **O ensaio tem 41 slugs órfãos no dado fictício** (§7.3). Produção tem 0. Some com um
   `db:reset`/`db:seed` no ensaio, ou com um seed que respeite `tipos_item` — é assunto do seed, não
   do código.
2. **Os roteiros sem tabela de resumo continuam sem prova via MCP** (o MCP engole `NOTICE`). Quem os
   prova é o job `banco`. Um resumo `create temp table` neles seria uma melhoria de outra fase.
3. **O termo NÃO foi tocado**, como a ordem determinou. `{outros_componentes}` continua saindo `''`.
   A F38 entrega o dado (`movimentacao_id`, `pendencia_item_id`, a conta por pessoa); a F39 o imprime.
4. **`ACESSORIOS_DEVOLUCAO` continua vivo** como fallback de rótulo do histórico. Deixou de governar
   o checklist; a remoção da constante é da F39.
5. **`scripts/import/carga.ts` não grava `movimentacao_id`** — é ferramenta de go-live, e a carga
   inicial não tem periférico vinculado. Não é defeito.
6. **A fila de 903 nomes da F37 continua esperando consolidação.** Enquanto `colaboradores`
   estiver vazia em produção, a conta por pessoa não tem em que casar: todo `retorno` sai sem
   vínculo pela regra §C.3, e o bloco "Com esta pessoa" mostra a frase de "ainda não está no
   cadastro". A F38 está no ar; ela **começa a fazer efeito** quando alguém consolidar a fila.
7. **`ativos.colaborador_atual` continua texto** (pendência nº 3 da F37, intocada por decisão).

## 11. O que este relatório NÃO prova

- **Não prova ausência de deadlock sob concorrência real.** O cenário 3 do roteiro é estrutural (o
  passo de travas continua no corpo, antes dos INSERTs) mais um conjunto de travas lido de
  `pg_locks`. Deadlock exige duas sessões concorrentes, e um roteiro de sessão única não as tem. A
  mesma limitação está escrita no cabeçalho do `transferencia_item.sql`, pela mesma razão.
- **Não prova a curva contra produção.** Foi medida no ensaio, e a transferibilidade se apoia no md5
  idêntico das funções — não em hardware idêntico. Produção tem 30 lançamentos: nenhum dos números
  desta curva descreve o que o operador sente hoje.
- **Não prova o comportamento dos roteiros sem tabela de resumo** (§10.2) — só que rodam sem erro.
- **Não prova que o índice `lanc_item_colaborador_idx` valha a pena HOJE.** Com 30 lançamentos, ele
  não muda nada. O que a medição prova é que ele é o único caminho para `rel_saldo_colaborador` não
  degradar linearmente com o tamanho da tabela, e que o custo de escrita é de 0,19 ms.
- **Não prova nada sobre a conta por pessoa EM PRODUÇÃO.** Não há colaborador cadastrado lá, e
  por isso a checagem de smoke correspondente respondeu `n/a`. Tudo o que se sabe da frente C vem
  do ensaio e dos testes — o primeiro número real virá quando a fila de nomes for consolidada.
- **Não prova o caminho do lote MISTO em tela.** A regra nova (`checklistPodeLancar`) tem teste
  unitário; o aviso na tela foi lido no código, não visto renderizado — a verificação em tela foi
  feita com um ativo só, que é justamente o caso que a regra não afeta.
- **Não prova a ausência do drift entre o arquivo da migration e o SQL aplicado.** A `0116`, aplicada
  via `apply_migration`, teve o cabeçalho de comentário condensado no envio; o DDL e os `comment on`
  são idênticos ao arquivo, e o schema resultante foi conferido — mas o texto registrado no ledger
  daquela migration é mais curto que o do arquivo.
