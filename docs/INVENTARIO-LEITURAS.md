# Inventário de leituras e escritas das cinco tabelas do acervo

> Entrega da **F57 · Frente H** (14/09/2026). É o **orçamento das fases F63–F67** do `docs/PLANO-MULTIEMPRESA.md`:
> cada linha é um lugar do código que toca `ativos`, `movimentacoes`, `lancamentos_item`, `pendencias_item` ou
> `colaboradores`, e a classificação diz se a virada multiempresa vai precisar escrever `empresa_id` ali ou se a RLS
> resolve. **Documento histórico da fase**: ele descreve o código de 14/09/2026 e não se atualiza — a F63 o relê contra
> o disco dela.

## Como foi feito

1. **Varredura do disco** — `.from('<tabela>')` literal nas cinco tabelas, em `src/**` fora de teste. Resultado:
   **115 call-sites em 21 arquivos**. (A ordem da fase citava 116 em `lib/queries`+`lib/actions`; a medição da
   F57 acha 116 ANTES da Frente E + 1 em `src/app` = 117; a Frente E juntou as três consultas de identidade de `compras.ts`,
   `actions/ativos.ts` e `devolucao-fornecedor.ts` numa só em `lib/ativos/identidade.ts`: 117 − 3 + 1 = **115**.)
2. **Chamadas dinâmicas** — `.from(<variável>)` não aparece na varredura literal. Uma segunda varredura por
   `.from(<identificador>)` achou quatro pontos que alcançam as cinco tabelas; eles entram **à parte** (13 pares ponto × tabela),
   para a soma literal continuar batendo com o grep.
3. **Classificação** por workflow: um leitor por grupo de arquivos (8) classificou cada call-site rastreando o CLIENT de
   verdade (abrindo os chamadores quando ele vem por parâmetro), e um verificador adversarial por grupo (8) refez a leitura
   sem confiar no primeiro. **Divergências entre leitor e verificador: 0.** As quatro chamadas dinâmicas fora de
   `import-logs.ts` foram rastreadas à mão nesta sessão, pela mesma régua.
4. **Conferência** — o script que monta este documento (`montar-inventario.mjs`, no scratchpad da sessão) recusa a saída se
   a soma por arquivo divergir da varredura, se sobrar call-site sem classificação ou classificação sem call-site.

## A régua (aplicada nesta ordem; a primeira que casa decide)

| # | Caso | Classificação | Fase |
|---|---|---|---|
| 1 | INSERT ou UPSERT (qualquer client) | precisa de `empresa_id` explícito — a F63 derruba o default da coluna | F63 |
| 2 | Operação por service role alcançável pelo VISUALIZADOR por senha | precisa de `empresa_id` explícito — a RLS não se aplica | F68 |
| 3 | Operação por service role fora do visualizador | precisa de `empresa_id` explícito | F67 |
| 4 | UPDATE ou DELETE pela sessão | confia na RLS — a policy de escrita ganha o recorte | F67 |
| 5 | SELECT (inclusive count) pela sessão | confia na RLS — a policy de leitura ganha o recorte | F66 |

## Os números

| | literais | dinâmicas | total |
|---|---:|---:|---:|
| confia na RLS · F66 | 89 | 13 | 102 |
| confia na RLS · F67 | 10 | 0 | 10 |
| precisa de empresa_id explícito · F63 | 4 | 0 | 4 |
| precisa de empresa_id explícito · F68 | 12 | 0 | 12 |
| **soma** | **115** | **13** | **128** |

Por classificação: **confia na RLS** 112 · **precisa de empresa_id explícito** 16.
Por fase de destino: **F63** 4 · **F66** 102 · **F67** 10 · **F68** 12.

> **Depois da F66 (24/09/2026 — a releitura das 102, decisão 15 do [`PLAN-F66.md`](PLAN-F66.md) §4).** As 102 linhas
> "confia na RLS · F66" estão ENTREGUES: a policy de leitura de cada tabela que elas tocam ganhou o termo de empresa em
> conjunção com o piso (MATRIZ R-ACC-108). **Com uma empresa, nenhuma muda** — provado conta a conta nos dois bancos:
> emulado antes do apply (`f66-evidencias/conta-a-conta/`), real depois de cada lote (`RELATORIO-F66.md`).
> Com duas, a leitura pela sessão passa a ver só as empresas de que a pessoa é membro, o certo na imensa maioria. As
> linhas deste documento não se editam (é histórico da F57); as que levantam a mão com duas empresas, relidas contra o
> disco de 24/09 (as linhas abaixo são as de HOJE, conferidas de novo na revisão adversarial da fase — o código andou desde
> a F57):
>
> | call-site | com duas empresas | fica com |
> |---|---|---|
> | `getDiagnostico` (`queries/dev.ts:96`, `/dev`) | as contagens passam a ser das empresas de que o dev é membro (a soma, se for de duas) | **F70**: contar pela empresa escolhida ou pela plataforma (definer) |
> | `excluirItem` (`actions/itens.ts:779`) | **fica certo por construção**: a FK composta `(empresa_id, item_id)` (F65) prende todo lançamento do item à empresa do item | nada a fazer |
> | `paresEmOutrasFiliais` (`queries/import-logs.ts:261/284`) | para o membro de duas, o par da OUTRA empresa entraria como "conflito" | **F67**: `where` pela empresa da filial do import |
> | `cadastrosComMesmaIdentidade` (`ativos/identidade.ts:150`) | o membro de duas seria recusado pela duplicata da outra empresa | **F67**: a recusa é da empresa do cadastro |
> | `contarPonteirosSubstituto` · `exportarDesvinculosFk` (`queries/import-logs.ts:215/636`) | **ficam certos**: a FK composta de `substitui_ativo_id` (F65) impede o ponteiro entre empresas | nada a fazer |
>
> Nenhuma virou código na F66 (a fase não muda o TS que o app executa).

### Soma por arquivo (varredura × inventário)

| Arquivo | varredura | inventário |
|---|---:|---:|
| `src/app/(app)/ativos/[id]/page.tsx` | 1 | 1 |
| `src/lib/actions/admin.ts` | 1 | 1 |
| `src/lib/actions/ativos.ts` | 7 | 7 |
| `src/lib/actions/colaboradores.ts` | 6 | 6 |
| `src/lib/actions/compras.ts` | 1 | 1 |
| `src/lib/actions/itens.ts` | 4 | 4 |
| `src/lib/actions/movimentacoes.ts` | 4 | 4 |
| `src/lib/actions/pendencias.ts` | 3 | 3 |
| `src/lib/actions/termos.ts` | 10 | 10 |
| `src/lib/ativos/identidade.ts` | 1 | 1 |
| `src/lib/queries/ativos.ts` | 10 | 10 |
| `src/lib/queries/colaboradores.ts` | 6 | 6 |
| `src/lib/queries/compras.ts` | 6 | 6 |
| `src/lib/queries/dev-destrutivo.ts` | 11 | 11 |
| `src/lib/queries/import-logs.ts` | 13 | 13 |
| `src/lib/queries/itens.ts` | 7 | 7 |
| `src/lib/queries/movimentacoes.ts` | 10 | 10 |
| `src/lib/queries/pendencias-detalhe.ts` | 1 | 1 |
| `src/lib/queries/relatorios/estoque.ts` | 6 | 6 |
| `src/lib/queries/relatorios/itens.ts` | 3 | 3 |
| `src/lib/queries/relatorios/movimentacoes.ts` | 4 | 4 |
| **total** | **115** | **115** |

## Os call-sites literais, arquivo a arquivo

### `src/app/(app)/ativos/[id]/page.tsx` (1)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 76 | `generateMetadata` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local a generateMetadata, linha 74); SELECT 'patrimonio' por id só para o <title> da aba — SELECT pela sessão, regra 5. Único .from() das cinco tabelas neste arquivo: o corpo da página (linhas 90-142) usa funções importadas de queries/ativos.ts, queries/movimentacoes.ts, queries/pendencias-item.ts etc., já contadas nos respectivos arquivos-fonte — bate com o esperado (1). |

### `src/lib/actions/admin.ts` (1)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 661 | `atualizarFilial` | `ativos` | select | sessao | confia na RLS | F66 | SELECT count/head pela sessão (client = createClient() na linha 626, guardada por exigirAdmin) conta ativos da filial para bloquear a desativação — única ocorrência das cinco tabelas neste arquivo (recontei todas as .from() do arquivo: só ativos/filiais/motivos aparecem); confia na RLS da F66. |

### `src/lib/actions/ativos.ts` (7)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 117 | `anotarAtivo` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient) faz SELECT de filial_id do ativo para resolver o vínculo de escrita antes de inserir a anotação — SELECT por sessão, regra 5, F66. |
| 172 | `atualizarDadosCadastrais` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT de filial_id do ativo (lookup próprio, id direto) para alimentar exigirEscrita — SELECT por sessão, regra 5, F66. |
| 183 | `atualizarDadosCadastrais` | `ativos` | update | sessao | confia na RLS | F67 | Client de sessão faz UPDATE dos campos cadastrais não derivados após exigirEscrita confirmar o vínculo de filial — UPDATE por sessão, regra 4, F67. |
| 242 | `corrigirPatrimonio` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT de patrimonio/service_tag/pendencia/filial_id (lookup pelo próprio id), insumo do exigirEscrita e da checagem de identidade entre filiais — SELECT por sessão, regra 5, F66. |
| 283 | `corrigirPatrimonio` | `ativos` | update | sessao | confia na RLS | F67 | Client de sessão faz UPDATE do patch (patrimônio corrigido + pendência 'sem patrimônio' encerrada quando aplicável) — UPDATE por sessão, regra 4, F67. |
| 329 | `definirServiceTag` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT de patrimonio/service_tag/pendencia/filial_id, espelhando corrigirPatrimonio — SELECT por sessão, regra 5, F66. |
| 372 | `definirServiceTag` | `ativos` | update | sessao | confia na RLS | F67 | Client de sessão faz UPDATE do patch (service tag definida + pendência 'sem service tag' encerrada quando aplicável) — UPDATE por sessão, regra 4, F67. |

### `src/lib/actions/colaboradores.ts` (6)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 111 | `criarColaboradorInline` | `colaboradores` | select | sessao | confia na RLS | F66 | Client de sessão (operador) faz SELECT por nome_chave para achar cadastro existente antes de criar/reativar inline — SELECT por sessão, regra 5; a dedup é dentro da própria empresa, então o recorte de F66 já entrega o resultado certo. |
| 135 | `criarColaboradorInline` | `colaboradores` | update | sessao | confia na RLS | F67 | Client de sessão faz UPDATE ativo=true (com .select('id') encadeado só para contar linhas afetadas) para reativar um cadastro desativado com a mesma nome_chave — UPDATE por sessão, regra 4, F67. |
| 163 | `criarColaboradorInline` | `colaboradores` | insert | sessao | precisa de empresa_id explícito | F63 | Client de sessão (operador) faz INSERT do colaborador novo, sem cadastro anterior com a mesma chave — INSERT cai na regra 1 independente do client: precisa de empresa_id explícito a partir de F63. |
| 194 | `criarColaborador` | `colaboradores` | insert | sessao | precisa de empresa_id explícito | F63 | Client de sessão (admin) faz INSERT do colaborador pela tela de administração — regra 1: INSERT sempre precisa de empresa_id explícito, F63. |
| 226 | `atualizarColaborador` | `colaboradores` | update | sessao | confia na RLS | F67 | Client de sessão (admin) faz UPDATE de nome/matrícula/setor/filial_id/ativo — UPDATE por sessão, regra 4, F67. |
| 294 | `consolidarColaboradores` | `colaboradores` | upsert | sessao | precisa de empresa_id explícito | F63 | Client de sessão (admin) faz UPSERT em lote (onConflict nome_chave, ignoreDuplicates) para materializar os grupos de texto — UPSERT cai na regra 1: cada linha vai precisar de empresa_id explícito, F63. |

### `src/lib/actions/compras.ts` (1)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 150 | `registrarCompra` | `ativos` | update | sessao | confia na RLS | F67 | Client de sessão faz UPDATE dos campos de celular (telefone/imei/pulsus) no(s) ativo(s) recém-criados pela RPC criar_compra_lote, fora da transação da compra — UPDATE por sessão, regra 4, F67; a RPC em si não conta (não é .from()). |

### `src/lib/actions/itens.ts` (4)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 367 | `estornarLancamento` | `lancamentos_item` | select | sessao | confia na RLS | F66 | SELECT pela sessão (createClient, guardada por exigirPapel('operador') e depois exigirEscrita na filial do lançamento) do lançamento original para montar o estorno — confia na RLS da F66. |
| 383 | `estornarLancamento` | `lancamentos_item` | select | sessao | confia na RLS | F66 | SELECT pela sessão checando se o lançamento já foi estornado (estorna_id = orig.id) — mesmo sendo uma checagem de recusa/idempotência, o inverso nasce sempre na mesma filial/empresa de `orig` (já lido sob RLS), então não é o caso de checagem cross-empresa da exceção do enunciado; continua confia na RLS da F66. |
| 398 | `estornarLancamento` | `lancamentos_item` | insert | sessao | precisa de empresa_id explícito | F63 | INSERT do lançamento inverso do estorno pela sessão — regra 1 (INSERT em qualquer client) exige gravar empresa_id explicitamente a partir da F63, senão falha no NOT NULL. |
| 720 | `excluirItem` | `lancamentos_item` | select | sessao | confia na RLS | F66 | SELECT count/head pela sessão (guardada por exigirAdmin) conta lançamentos do item para decidir se pode excluir; `itens` é catálogo GLOBAL sem filial — se seguir global entre empresas este guard pode precisar olhar todas as empresas (o caso de decisão de recusa citado no enunciado), mas ainda assim classifica-se como confia na RLS por ser um SELECT pela sessão (F66); a nuance vai só na justificativa. |

### `src/lib/actions/movimentacoes.ts` (4)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 281 | `registrarMovimentacoes` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT do estado corrente (id/filial_id/status/colaborador_atual) de cada ativo do lote antes de montar as rows para a RPC criar_movimentacao_com_itens — SELECT por sessão, regra 5, F66. |
| 618 | `estornarMovimentacao` | `movimentacoes` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT (id/ativo_id/tipo) da movimentação original a partir do id recebido, para localizar o ativo a estornar — SELECT por sessão, regra 5, F66. |
| 626 | `estornarMovimentacao` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT (id/filial_id) do ativo para obter a filial CORRENTE que autoriza o estorno — SELECT por sessão, regra 5, F66. |
| 646 | `estornarMovimentacao` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT dos lançamentos de item da movimentação (não estornados) para calcular os inversos via planejarEstorno — SELECT por sessão, regra 5, F66. |

### `src/lib/actions/pendencias.ts` (3)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 55 | `resolverPendenciaItem` | `pendencias_item` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT das pendências-alvo (id/ativo_id/filial_id/item/colaborador/status) antes de resolver em lote — SELECT por sessão, regra 5, F66. |
| 293 | `reabrirPendenciaItem` | `pendencias_item` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT das pendências já resolvidas (status='resolvida') que serão reabertas — SELECT por sessão, regra 5, F66. |
| 322 | `reabrirPendenciaItem` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão faz SELECT dos lançamentos de item vinculados às pendências (pendencia_item_id, não estornados) para estorná-los ao reabrir — SELECT por sessão, regra 5, F66. |

### `src/lib/actions/termos.ts` (10)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 209 | `prepararTermo` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT pela sessão (createClient, linha 187, guardada só por exigirPapel('consulta') — leitura é piso, não vínculo) das movimentações do lote para montar o pré-preenchimento do diálogo do termo — SELECT comum, confia na RLS da F66. |
| 547 | `aplicarFlagTermo` | `ativos` | update | sessao | confia na RLS | F67 | UPDATE de ativos.termo_assinado='gerado' pela sessão — `aplicarFlagTermo` recebe `supabase: ServerClient` por parâmetro, mas o único chamador (gerarTermo, linha 629) sempre passa o `supabase` de `createClient()` (linha 560) — escrita pela sessão confia na policy recortada por empresa na F67. |
| 569 | `gerarTermo` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT pela sessão de ativo_id das movimentações do lote (nunca confia no ativoIds vindo do cliente) — leitura comum, confia na RLS da F66. |
| 583 | `gerarTermo` | `ativos` | select | sessao | confia na RLS | F66 | SELECT pela sessão de filial_id dos ativos, usado em seguida por exigirEscritaEm — como a filial já delimita o escopo (não é checagem de unicidade cross-empresa), segue a regra padrão do SELECT pela sessão: confia na RLS da F66. |
| 722 | `confirmarAssinaturaTermo` | `ativos` | select | sessao | confia na RLS | F66 | SELECT pela sessão de termo_assinado/filial_id de um ativo antes de gravar a confirmação — leitura simples, confia na RLS da F66. |
| 737 | `confirmarAssinaturaTermo` | `ativos` | update | sessao | confia na RLS | F67 | UPDATE de ativos.termo_assinado='sim' pela sessão — escrita pela sessão confia na policy recortada por empresa na F67. |
| 779 | `desfazerConfirmacaoTermo` | `ativos` | select | sessao | confia na RLS | F66 | SELECT pela sessão de termo_assinado/filial_id do ativo antes de desfazer a confirmação — confia na RLS da F66. |
| 804 | `desfazerConfirmacaoTermo` | `ativos` | update | sessao | confia na RLS | F67 | UPDATE de ativos.termo_assinado (volta a 'gerado' ou 'nao') pela sessão — escrita pela sessão confia na policy recortada por empresa na F67. |
| 883 | `confirmarAssinaturaLote` | `ativos` | select | sessao | confia na RLS | F66 | SELECT pela sessão de id/filial_id/termo_assinado dos ativos do lote antes de confirmar — confia na RLS da F66. |
| 910 | `confirmarAssinaturaLote` | `ativos` | update | sessao | confia na RLS | F67 | UPDATE em lote de ativos.termo_assinado='sim' pela sessão (filtrado a pendentesIds) — escrita pela sessão confia na policy recortada por empresa na F67. |

### `src/lib/ativos/identidade.ts` (1)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 150 | `cadastrosComMesmaIdentidade` | `ativos` | select | sessao | confia na RLS | F66 | Função recebe o client por parâmetro; grep dos chamadores (actions/ativos.ts, actions/compras.ts, actions/devolucao-fornecedor.ts — confirmado sem createAdminClient nem resolverAcessoRelatorio em nenhum dos três) mostra todos passando createClient() de sessão — pior caso é sessão. SELECT com .in()/.is() (regra 5, F66); alimenta a recusa de identidade duplicada com ALCANCE_DA_RECUSA_MANUAL = todas-as-unidades (decisão que hoje ignora filial de propósito, spec §10.2) — continua 'confia na RLS' pela exceção do enunciado (a decisão de unicidade precisa ser por empresa mesmo com RLS), mas o alcance multiempresa dessa varredura precisa ser revisto no desenho de F66/F67. Textualmente só há um `.from('ativos')` no arquivo, embora `base()` seja invocada duas vezes em runtime (patrimônio e service tag sem patrimônio). |

### `src/lib/queries/ativos.ts` (10)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 162 | `queryLista (helper de listarAtivos)` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() em listarAtivos, repassado a queryLista como Awaited<ReturnType<typeof createClient>>); SELECT com count/head para a lista paginada de /ativos — SELECT pela sessão, regra 5. |
| 277 | `buscarAtivoPorId` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local à função, sem parâmetro); SELECT '*, filiais(slug,nome)' por id para a ficha do ativo — SELECT pela sessão, regra 5. |
| 304 | `buscarVinculoAtivo` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local); SELECT id+patrimonio do ativo que este substitui (vínculo de sucessão F14/MN4) — SELECT pela sessão, regra 5. |
| 318 | `buscarSubstitutoDe` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local); SELECT id+patrimonio de quem substituiu este ativo via substitui_ativo_id — SELECT pela sessão, regra 5. |
| 445 | `patrimoniosDuplicados` | `ativos` | select | sessao | confia na RLS | F66 | Client recebido por parâmetro, mas SEMPRE de sessão: fronteira-viewer.test.ts (linha 171-172) declara este arquivo como EXCEÇÃO nominal ('patrimoniosDuplicados é chamada por queries/movimentacoes.ts:285, interna a listarAtivos, e pela rota /ativos — nunca por rota de relatório'), confirmado por grep em movimentacoes.ts (linha 293, dentro de função que usa createClient() de @/lib/supabase/server na linha 267). SELECT '.in(patrimonio,…)' alimenta a flag de exibição 'patrimonio_duplicado' (desambiguação de service tag no combobox), não uma recusa/gate de escrita — continua regra 5 mesmo alimentando uma decisão de UI. |
| 479 | `buscarAtivosParaCombobox` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local); SELECT RESUMO_SELECT com .or() por palavra para o combobox de movimentação — SELECT pela sessão, regra 5. |
| 576 | `listarAtivosParaExport` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local, reusado a cada volta do laço de blocos); SELECT EXPORT_SELECT em blocos de .range() para o CSV de /ativos — SELECT pela sessão, regra 5. |
| 633 | `buscarAtivosResumoPorIds` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local); SELECT RESUMO_SELECT '.in(id,…)' para resolver os ids do rascunho de movimentação — SELECT pela sessão, regra 5. |
| 666 | `buscarAtivosPorPatrimonios` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local); SELECT RESUMO_SELECT '.in(patrimonio,…)' para o fluxo 'colar lista' — SELECT pela sessão, regra 5. |
| 688 | `buscarAtivoResumo` | `ativos` | select | sessao | confia na RLS | F66 | Client de sessão (createClient() local); SELECT RESUMO_SELECT por id (preseleção vinda da ficha/duplicar) — SELECT pela sessão, regra 5. |

### `src/lib/queries/colaboradores.ts` (6)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 88 | `listarColaboradoresAdmin` | `colaboradores` | select | sessao | confia na RLS | F66 | Client de sessão (createClient na linha 80), único chamador é admin/colaboradores/page.tsx (rota de admin, não de relatório); SELECT paginado (paginarTodos) — confia na RLS. |
| 227 | `resolverColaboradoresPorNome` | `colaboradores` | select | sessao | confia na RLS | F66 | Client de sessão recebido por parâmetro; grep confirma 4 chamadores, todos Server Actions (actions/colaboradores.ts, actions/itens.ts, actions/movimentacoes.ts, actions/pendencias.ts), todos com supabase tipado Awaited<ReturnType<typeof createClient>>; fronteira-viewer.test.ts declara esta função como exceção sempre com client de sessão. SELECT confia na RLS. |
| 321 | `sugestoesDoCampoColaborador` | `colaboradores` | select | sessao | confia na RLS | F66 | Client de sessão (createClient na linha 285); único chamador é actions/movimentacoes.ts (Server Action); SELECT por nome_chave para o autocomplete de 'cadastrados' — confia na RLS. |
| 354 | `sugestoesDoCampoColaborador` | `movimentacoes` | select | sessao | confia na RLS | F66 | Mesmo client de sessão da função (createClient na linha 285); SELECT do texto livre colaborador no histórico de movimentações para sugestão — confia na RLS. |
| 363 | `sugestoesDoCampoColaborador` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Mesmo client de sessão da função (createClient na linha 285); mesmo padrão da linha 354, agora sobre lancamentos_item — confia na RLS. |
| 375 | `sugestoesDoCampoColaborador` | `colaboradores` | select | sessao | confia na RLS | F66 | Mesmo client de sessão da função (createClient na linha 285); SELECT exato por nome_chave que decide jaCadastrado (gate de unicidade) — leitura pela sessão continua confia na RLS, que passa a recortar por empresa na F66. |

### `src/lib/queries/compras.ts` (6)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 132 | `sugestoesMarcas` | `ativos` | select | sessao | confia na RLS | F66 | createClient() na linha 128 (sessao); SELECT em blocos (range) para sugestao de marca — regra 5. |
| 160 | `sugestoesModelos` | `ativos` | select | sessao | confia na RLS | F66 | createClient() na linha 156 (sessao); SELECT em blocos para sugestao de modelo, filtrado por marca — regra 5. |
| 188 | `sugestoesFornecedores` | `ativos` | select | sessao | confia na RLS | F66 | createClient() na linha 184 (sessao); SELECT em blocos para sugestao de fornecedor — regra 5. |
| 261 | `dadosParaDuplicarCompra` | `ativos` | select | sessao | confia na RLS | F66 | createClient() na linha 258 (sessao); SELECT por id do ativo de referencia para 'Comprar outro igual' — regra 5. |
| 274 | `dadosParaDuplicarCompra` | `movimentacoes` | select | sessao | confia na RLS | F66 | mesmo `supabase` de sessao da funcao (linha 258); SELECT da movimentacao tipo=compra do ativo para achar a filial da compra — regra 5. |
| 298 | `ultimaCompraDoOperador` | `movimentacoes` | select | sessao | confia na RLS | F66 | createClient() na linha 296 (sessao); SELECT com embed ativos(...) da ultima compra do operador para 'Repetir ultima compra' — regra 5. |

### `src/lib/queries/dev-destrutivo.ts` (11)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 76 | `buscarAtivosDestrutivo` | `ativos` | select | sessao | confia na RLS | F66 | createClient() de sessão (via sessaoDeDev/exigirDev) faz SELECT com .or() ilike em patrimonio/service_tag/hostname — regra 5; nunca alcançável pelo visualizador por senha (só usado em /dev/destrutivo). |
| 131 | `carregarFichaDestrutiva` | `ativos` | select | sessao | confia na RLS | F66 | SELECT por id (maybeSingle) via client de sessão para montar a ficha do ativo exibida antes do botão destrutivo — regra 5. |
| 146 | `carregarFichaDestrutiva` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT da linha do tempo (eq ativo_id, order created_at/id, limit) via client de sessão, só leitura para exibição — regra 5. |
| 155 | `carregarFichaDestrutiva` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT count/head (eq ativo_id) via client de sessão, dentro do Promise.all que monta os totais da ficha — regra 5. |
| 157 | `carregarFichaDestrutiva` | `pendencias_item` | select | sessao | confia na RLS | F66 | SELECT count/head (eq ativo_id) via client de sessão, mesmo Promise.all de totais (as linhas vizinhas de anotacoes/termos_gerados não entram nas 5 tabelas do escopo) — regra 5. |
| 221 | `alvoDaMovimentacao` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT ativo_id por id (maybeSingle) via client de sessão para achar o ativo dono da movimentação — regra 5; alimenta só o rótulo de confirmação digitado, não uma decisão de unicidade entre empresas. |
| 229 | `alvoDaMovimentacao` | `ativos` | select | sessao | confia na RLS | F66 | SELECT id/patrimonio/service_tag por id (maybeSingle) via client de sessão, para montar o rótulo de confirmação (rotuloDoAtivo) — regra 5. |
| 302 | `listarItensDestrutivo` | `lancamentos_item` | select | sessao | confia na RLS | F66 | SELECT count/head (eq item_id) via client de sessão, uma chamada por item dentro de mapComLimite — regra 5. |
| 399 | `montarBackupDoReset` | `lancamentos_item` | select | sessao | confia na RLS | F66 | SELECT '*' paginado (eq filial_id quando o reset não é global) via client de sessão, para montar o JSON de backup antes do reset destrutivo de itens — regra 5; o recorte que a RLS futura vai impor (só a empresa do dev) é o comportamento desejado, não uma lacuna. |
| 427 | `montarBackupDoReset` | `ativos` | select | sessao | confia na RLS | F66 | SELECT '*' paginado (eq filial_id quando não-global) via client de sessão, para montar o backup do acervo antes do reset — regra 5. |
| 537 | `montarBackupDoReset` | `ativos` | select | sessao | confia na RLS | F66 | SELECT '*' paginado (in substitui_ativo_id sobre os lotes do recorte) via client de sessão, para capturar no backup os ponteiros de outras filiais que apontam para o recorte apagado — regra 5. |

### `src/lib/queries/import-logs.ts` (13)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 82 | `idsDaFilial` | `ativos` | select | sessao | confia na RLS | F66 | SELECT paginado de ids de ativos da filial pelo client de sessão (idsDaFilial recebe client vindo, em runtime, sempre de createClient() em actions/importar.ts ou admin/importar/page.tsx:36); RLS aplica → F66. |
| 91 | `contarMovs` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT count/head pela sessão, contando movimentações por lote de ativo_id; RLS aplica → confia na RLS (F66). |
| 122 | `contarPendenciasItem` | `pendencias_item` | select | sessao | confia na RLS | F66 | SELECT count/head pela sessão, contando pendencias_item por lote de ativo_id (espelha v_liv_pend da 0140); RLS aplica → confia na RLS (F66). |
| 161 | `contarLancamentosPorColuna` | `lancamentos_item` | select | sessao | confia na RLS | F66 | SELECT count/head pela sessão em lancamentos_item, filtrando pela coluna dinâmica (movimentacao_id ou pendencia_item_id); RLS aplica → confia na RLS (F66). |
| 179 | `contarPonteirosSubstituto` | `ativos` | select | sessao | confia na RLS | F66 | SELECT count/head pela sessão contando ativos de outra filial cujo substitui_ativo_id aponta para o acervo (espelha v_liv_subst da 0140); RLS aplica → confia na RLS (F66). |
| 225 | `paresEmOutrasFiliais` | `ativos` | select | sessao | confia na RLS | F66 | SELECT pela sessão (pares COM patrimônio) buscando ativos em outras filiais para alimentar a decisão de conflito de índice (patrimonio_em_outra_filial); é decisão que tem de ser por empresa mesmo com a RLS — continua confia na RLS, conforme a exceção do enunciado. |
| 245 | `paresEmOutrasFiliais` | `ativos` | select | sessao | confia na RLS | F66 | SELECT pela sessão (sem patrimônio, com service tag) buscando ativos em outras filiais, mesmo papel de decisão de conflito que a parte 1; continua confia na RLS (F66). |
| 349 | `exportarAcervoFilial` | `ativos` | select | sessao | confia na RLS | F66 | SELECT * pela sessão exportando ativos da filial para o JSON de backup pré-import (paginado); RLS aplica → confia na RLS (F66). |
| 356 | `exportarAcervoFilial` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT * pela sessão exportando movimentações do acervo (por lote de ativo_id) para o backup; RLS aplica → confia na RLS (F66). |
| 454 | `exportarDesvinculosFk` | `pendencias_item` | select | sessao | confia na RLS | F66 | SELECT * pela sessão exportando pendencias_item do acervo (por lote de ativo_id) para a pré-imagem do backup de FK (0140); RLS aplica → confia na RLS (F66). |
| 470 | `exportarDesvinculosFk` | `lancamentos_item` | select | sessao | confia na RLS | F66 | SELECT pela sessão listando lancamentos_item presos a movimentacao_id do acervo (pré-imagem antes do desvínculo); RLS aplica → confia na RLS (F66). |
| 483 | `exportarDesvinculosFk` | `lancamentos_item` | select | sessao | confia na RLS | F66 | SELECT pela sessão listando lancamentos_item presos a pendencia_item_id do acervo (pré-imagem antes do desvínculo); RLS aplica → confia na RLS (F66). |
| 503 | `exportarDesvinculosFk` | `ativos` | select | sessao | confia na RLS | F66 | SELECT * pela sessão listando ativos de outra filial cujo substitui_ativo_id aponta para o acervo (ponteiros perdidos, para o backup de FK); RLS aplica → confia na RLS (F66). |

### `src/lib/queries/itens.ts` (7)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 418 | `queryHistorico` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão recebido por parâmetro; os dois chamadores (getHistoricoLancamentos e listarHistoricoParaExport) criam o client com createClient() e o cabeçalho do arquivo declara a rota /itens como só-operador (visualizador por senha não acessa) — SELECT que confia na RLS. |
| 501 | `getHistoricoLancamentos` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão (createClient na linha 461); SELECT de estorna_id para marcar quais linhas da página já foram estornadas — confia na RLS. |
| 571 | `getUltimoLancamento` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão (createClient na linha 577); SELECT do último lançamento do operador para 'repetir último' — confia na RLS. |
| 592 | `listarLancamentosParaSaldoApos` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão (createClient na linha 552); SELECT paginado do histórico item×filial para o cálculo de 'Saldo após' — confia na RLS. |
| 691 | `lancamentosSemVinculo` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão (createClient na linha 676); SELECT count/head para o aviso de lançamentos sem colaborador_id — confia na RLS. |
| 731 | `itensQueForamJunto` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão (createClient na linha 716); SELECT via join por movimentacao_id para 'Itens que foram junto' na ficha do ativo — confia na RLS. |
| 819 | `acessoriosDasMovimentacoes` | `lancamentos_item` | select | sessao | confia na RLS | F66 | Client de sessão recebido por parâmetro; grep confirma os dois chamadores em src/lib/actions/termos.ts (Server Action, client de sessão), e fronteira-viewer.test.ts declara explicitamente esta função como exceção que 'só sai de Server Actions' — nunca do visualizador por senha. SELECT confia na RLS. |

### `src/lib/queries/movimentacoes.ts` (10)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 117 | `listarMovimentacoesDoAtivo` | `movimentacoes` | select | sessao | confia na RLS | F66 | createClient() de '@/lib/supabase/server' na linha 102 (sessao/anon key+cookies); SELECT paginado da linha do tempo do ativo — regra 5. |
| 168 | `ultimoEnvioManutencao` | `movimentacoes` | select | sessao | confia na RLS | F66 | createClient() na linha 164 (sessao); SELECT maybeSingle do ultimo envio_manutencao para prefill — regra 5. |
| 202 | `ultimaMovimentacaoDoUsuario` | `movimentacoes` | select | sessao | confia na RLS | F66 | createClient() na linha 198 (sessao); SELECT para 'repetir ultima' do proprio operador — regra 5. |
| 238 | `buscarMovimentacaoParaDuplicar` | `movimentacoes` | select | sessao | confia na RLS | F66 | createClient() na linha 234 (sessao); SELECT por id para o fluxo 'Duplicar' — regra 5. |
| 271 | `ultimosAtivosMovimentadosDoOperador` | `movimentacoes` | select | sessao | confia na RLS | F66 | createClient() na linha 267 (sessao); SELECT com embed ativos(...) para sugestoes do combobox — regra 5 (o embed nao e um .from separado). |
| 331 | `sugestoesDeColuna` | `movimentacoes` | select | sessao | confia na RLS | F66 | createClient() na linha 327 (sessao); SELECT ilike para sugestoes de colaborador/setor — regra 5. |
| 396 | `possiveisDuplicatasDoDia` | `movimentacoes` | select | sessao | confia na RLS | F66 | createClient() na linha 390 (sessao); 1a consulta (candidatas ativo/tipo/data) alimenta o aviso de duplicata, mas ja parte de ativoIds do chamador (um ativo = uma empresa) — continua regra 5, nao regra de decisao por empresa. |
| 425 | `possiveisDuplicatasDoDia` | `movimentacoes` | select | sessao | confia na RLS | F66 | mesmo `supabase` de sessao da funcao (linha 390); 2a consulta (estorno_de in candidatas) — regra 5. |
| 658 | `queryLista (helper de listarMovimentacoes)` | `movimentacoes` | select | sessao | confia na RLS | F66 | recebe supabase por parametro; funcao nao exportada, unico chamador e listarMovimentacoes (createClient sessao na linha 701) — nenhuma rota de relatorios/visualizador chega aqui — regra 5. |
| 750 | `listarMovimentacoes` | `movimentacoes` | select | sessao | confia na RLS | F66 | mesmo `supabase` de sessao (linha 701); 2a consulta (estorno_de in ids da pagina) — regra 5. |

### `src/lib/queries/pendencias-detalhe.ts` (1)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 190 | `buscarServiceTags` | `ativos` | select | sessao | confia na RLS | F66 | Função NÃO exportada que recebe client: DbClient por parâmetro; fronteira-viewer.test.ts (linhas 66-69) confirma explicitamente que as duas funções internas deste arquivo (buscarServiceTags e queryPendencias) nunca alcançam o viewer, pois as três funções EXPORTADAS criam o próprio client via createClient() (confirmado: listarPendencias cria client na linha 251 e o repassa). SELECT 'id, service_tag' '.in(id, ids)' para completar o diálogo de correção de patrimônio — SELECT pela sessão, regra 5. Contagem de .from() nas cinco tabelas bateu com a esperada (1): as outras duas chamadas .from() do arquivo (linhas 121 e 198) são v_fila_pendencias, view fora do escopo pedido. |

### `src/lib/queries/relatorios/estoque.ts` (6)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 75 | `lerEstadoAtivos` | `ativos` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | lerEstadoAtivos e chamada dentro de getSnapshotRelatorioV2 (snapshot.ts:70 estadoNoFim, :86 estado anterior, e via getSerieEstado em :118), que recebe client de resolverAcessoRelatorio em relatorios/[filial]/page.tsx:133-134 — para o viewer por senha esse client e createAdminClient() (service_role, RLS nao aplica); tambem alimenta getKpis (dashboard, (app)/page.tsx:128, client de sessao) e a action gerarRelatorio (actions/relatorios.ts:89, client de sessao). Pior caso e o service_role do viewer — regra 2. Confirmado: 6 ocorrencias das 5 tabelas no arquivo (bate com o total esperado; a 7a `.from()` do arquivo, linha 501, e 'anotacoes', fora do escopo). |
| 303 | `dadosAtivos` | `ativos` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | dadosAtivos (funcao interna, nao exportada) so e chamada por reservadosDeEstado e manutencaoDeEstado (estoque.ts:361,481) — ambas acionadas exclusivamente no segundo Promise.all de getSnapshotRelatorioV2 (snapshot.ts:137-139), com o mesmo client resolvido do viewer por senha (service_role) quando acesso.modo === 'viewer' — regra 2. Nenhum outro call site (grep confirma). |
| 332 | `chamadoAteData` | `movimentacoes` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | chamadoAteData (interna) so e chamada por reservadosDeEstado (estoque.ts:362), dentro de getSnapshotRelatorioV2 (snapshot.ts:138) — mesmo client do viewer por senha sob service_role — regra 2. |
| 408 | `manutencaoDeEstado` | `movimentacoes` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | manutencaoDeEstado (leitura de retornos de manutencao) e exportada mas so tem UM chamador real: getSnapshotRelatorioV2 (snapshot.ts:139) — reachable pelo visualizador por senha sob service_role (resolverAcessoRelatorio -> createAdminClient) — regra 2. |
| 432 | `manutencaoDeEstado` | `movimentacoes` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | Mesma funcao manutencaoDeEstado (leitura de devolucoes ao fornecedor), mesmo e unico chamador via getSnapshotRelatorioV2 (snapshot.ts:139) — client do viewer por senha sob service_role — regra 2. |
| 487 | `manutencaoDeEstado` | `movimentacoes` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | Mesma funcao manutencaoDeEstado (leitura de envios de manutencao, dentro do Promise.all com dadosAtivos), mesmo e unico chamador via getSnapshotRelatorioV2 (snapshot.ts:139) — client do viewer por senha sob service_role — regra 2. |

### `src/lib/queries/relatorios/itens.ts` (3)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 96 | `getGruposItens` | `lancamentos_item` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | getGruposItens (exportada) so e chamada por getSnapshotRelatorioV2 (snapshot.ts:105), que recebe o client resolvido por resolverAcessoRelatorio — o viewer por senha entra com createAdminClient() (service_role, RLS nao aplica) — regra 2. Contagem de 3 ocorrencias das 5 tabelas no arquivo confirmada; `.from('itens')` de lerMinimosDoCatalogo (linha 65) fica fora do escopo por nao ser uma das cinco tabelas. |
| 271 | `buscarLancEstornadosAteData` | `lancamentos_item` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | buscarLancEstornadosAteData (interna) so e chamada por getLancamentosItensPeriodo (itens.ts:325), que so e chamada por getSnapshotRelatorioV2 (snapshot.ts:108) — mesmo client do viewer por senha sob service_role — regra 2. |
| 295 | `getLancamentosItensPeriodo` | `lancamentos_item` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | getLancamentosItensPeriodo (exportada) so e chamada por getSnapshotRelatorioV2 (snapshot.ts:108) — client do viewer por senha sob service_role — regra 2. |

### `src/lib/queries/relatorios/movimentacoes.ts` (4)

| Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---:|---|---|---|---|---|---|---|
| 67 | `serieCurta` | `movimentacoes` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | serieCurta (interna) e chamada por getSerieMovimentacoes (movimentacoes.ts:90), que so e chamada por getSnapshotRelatorioV2 (snapshot.ts:87) — client do viewer por senha sob service_role — regra 2. Contagem de 4 ocorrencias de movimentacoes no arquivo confirmada (nenhuma das outras cinco tabelas aparece aqui). |
| 218 | `getUltimasMovimentacoes` | `movimentacoes` | select | sessao | confia na RLS | F66 | getUltimasMovimentacoes (exportada) tem UM UNICO call site real fora da propria definicao/index.ts: (app)/page.tsx:143, com client = await createClient() (sessao) definido em page.tsx:linha do createClient no topo do arquivo — grep global no repo confirma que nunca e chamada por getSnapshotRelatorioV2 nem por rota de relatorio/viewer. SELECT pela sessao cai na regra 5, RLS aplica. |
| 287 | `buscarLinhasPeriodo` | `movimentacoes` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | buscarLinhasPeriodo (interna) e chamada 3x por getTabelasFinais (movimentacoes.ts:355,360,361), que so e chamada por getSnapshotRelatorioV2 (snapshot.ts:106) — client do viewer por senha sob service_role — regra 2. |
| 336 | `buscarEstornosAteData` | `movimentacoes` | select | sessao_ou_service_role_visualizador | precisa de empresa_id explícito | F68 | buscarEstornosAteData (interna) e chamada por getTabelasFinais (movimentacoes.ts:362), mesma cadeia via getSnapshotRelatorioV2 (snapshot.ts:106) — client do viewer por senha sob service_role — regra 2. |

## As chamadas dinâmicas (`.from(<variável>)`)

Uma linha por par ponto × tabela alcançada. Não entram na soma literal — a varredura por string não as vê, e é justamente
por isso que ficam registradas: a F63 que só procurar `.from('ativos')` vai perdê-las.

| Arquivo | Linha | Função | Tabela | Operação | Client | Classificação | Fase | Por quê |
|---|---:|---|---|---|---|---|---|---|
| `src/lib/queries/conflitos.ts` | 472 | `acervoDosAtivos` | `ativos` | select | sessao | confia na RLS | F66 | SELECT paginado por `.from(nome)` (nome ∈ ativos/movimentacoes/anotacoes/pendencias_item) com o client de sessão de `apagarConflito` (createClient + exigirAdmin, actions/conflitos.ts) — RLS aplica. |
| `src/lib/queries/conflitos.ts` | 472 | `acervoDosAtivos` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT paginado por `.from(nome)` (nome ∈ ativos/movimentacoes/anotacoes/pendencias_item) com o client de sessão de `apagarConflito` (createClient + exigirAdmin, actions/conflitos.ts) — RLS aplica. |
| `src/lib/queries/conflitos.ts` | 472 | `acervoDosAtivos` | `pendencias_item` | select | sessao | confia na RLS | F66 | SELECT paginado por `.from(nome)` (nome ∈ ativos/movimentacoes/anotacoes/pendencias_item) com o client de sessão de `apagarConflito` (createClient + exigirAdmin, actions/conflitos.ts) — RLS aplica. |
| `src/lib/queries/dev-destrutivo.ts` | 447 | `montarBackupDoReset (sem filial)` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT do backup antes do reset por `.from(tabela)` (tabela ∈ movimentacoes/anotacoes/pendencias_item) com `sessaoDeDev()` = createClient + exigirDev — RLS aplica; na virada o dev passa a ler só as empresas de que é membro (decisão da F69/F70 sobre a conta de plataforma). |
| `src/lib/queries/dev-destrutivo.ts` | 447 | `montarBackupDoReset (sem filial)` | `pendencias_item` | select | sessao | confia na RLS | F66 | SELECT do backup antes do reset por `.from(tabela)` (tabela ∈ movimentacoes/anotacoes/pendencias_item) com `sessaoDeDev()` = createClient + exigirDev — RLS aplica; na virada o dev passa a ler só as empresas de que é membro (decisão da F69/F70 sobre a conta de plataforma). |
| `src/lib/queries/dev-destrutivo.ts` | 456 | `montarBackupDoReset (por lote de ativo)` | `movimentacoes` | select | sessao | confia na RLS | F66 | SELECT do backup antes do reset por `.from(tabela)` (tabela ∈ movimentacoes/anotacoes/pendencias_item) com `sessaoDeDev()` = createClient + exigirDev — RLS aplica; na virada o dev passa a ler só as empresas de que é membro (decisão da F69/F70 sobre a conta de plataforma). |
| `src/lib/queries/dev-destrutivo.ts` | 456 | `montarBackupDoReset (por lote de ativo)` | `pendencias_item` | select | sessao | confia na RLS | F66 | SELECT do backup antes do reset por `.from(tabela)` (tabela ∈ movimentacoes/anotacoes/pendencias_item) com `sessaoDeDev()` = createClient + exigirDev — RLS aplica; na virada o dev passa a ler só as empresas de que é membro (decisão da F69/F70 sobre a conta de plataforma). |
| `src/lib/queries/dev.ts` | 94 | `getDiagnostico` | `ativos` | select | sessao | confia na RLS | F66 | count/head por `.from(tabela)` sobre TABELAS_DIAGNOSTICO com `sessaoDeDev()` = createClient + exigirDev — RLS aplica; a contagem do diagnóstico passa a ser por empresa na F66 (conferir se é o que a /dev quer). |
| `src/lib/queries/dev.ts` | 94 | `getDiagnostico` | `lancamentos_item` | select | sessao | confia na RLS | F66 | count/head por `.from(tabela)` sobre TABELAS_DIAGNOSTICO com `sessaoDeDev()` = createClient + exigirDev — RLS aplica; a contagem do diagnóstico passa a ser por empresa na F66 (conferir se é o que a /dev quer). |
| `src/lib/queries/dev.ts` | 94 | `getDiagnostico` | `movimentacoes` | select | sessao | confia na RLS | F66 | count/head por `.from(tabela)` sobre TABELAS_DIAGNOSTICO com `sessaoDeDev()` = createClient + exigirDev — RLS aplica; a contagem do diagnóstico passa a ser por empresa na F66 (conferir se é o que a /dev quer). |
| `src/lib/queries/dev.ts` | 94 | `getDiagnostico` | `pendencias_item` | select | sessao | confia na RLS | F66 | count/head por `.from(tabela)` sobre TABELAS_DIAGNOSTICO com `sessaoDeDev()` = createClient + exigirDev — RLS aplica; a contagem do diagnóstico passa a ser por empresa na F66 (conferir se é o que a /dev quer). |
| `src/lib/queries/import-logs.ts` | 146 | `idsPorAtivo` | `movimentacoes` | select | sessao | confia na RLS | F66 | client.from(tabela) genérico; esta invocação roda com tabela='movimentacoes' (chamadas em custoSubstituir:298 e exportarDesvinculosFk:460); SELECT pela sessão, RLS aplica → confia na RLS (F66). |
| `src/lib/queries/import-logs.ts` | 146 | `idsPorAtivo` | `pendencias_item` | select | sessao | confia na RLS | F66 | Mesma linha 146, segunda invocação com tabela='pendencias_item' (chamadas em custoSubstituir:299 e exportarDesvinculosFk:461); SELECT pela sessão, RLS aplica → confia na RLS (F66). |

## O que este inventário NÃO prova

- **Classifica por LEITURA do código, não por execução.** Nenhum call-site foi exercitado contra um banco com duas
  empresas. A F63 pode — e deve — discordar de linhas daqui ao reler o código dela; o valor está em a lista existir inteira.
- **"Confia na RLS" não quer dizer "nada a fazer".** Quer dizer que o recorte de empresa chega pela policy (F66/F67),
  desde que a policy seja escrita. Uma leitura pela sessão cuja correção dependa de ver OUTRAS empresas (hoje: nenhuma
  identificada) mudaria de sentido em silêncio na F66.
- **Não cobre `scripts/**`**: são ferramentas de service role que não servem tela (carga do go-live, seed, smoke,
  manutenção). A varredura mediu **38** call-sites lá; eles não entram no orçamento das fases de app, e cada script
  que sobreviver à virada precisa da própria decisão de empresa.
- **Não cobre RPCs.** Escrita e leitura por `.rpc(...)` (as funções `security definer`) não são `.from()`; o levantamento
  delas é da F52/F67 (a tabela-verdade de `definer_sem_tenant.sql`).
- **Não cobre views.** `v_fila_pendencias`, `v_conflitos_filiais` e as demais leem as cinco tabelas por dentro; elas são
  `security_invoker` e herdam a RLS, e a F67 trata as que agregam antes de recortar.
