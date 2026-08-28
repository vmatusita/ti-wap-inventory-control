ultracode

# Ordem de serviço F38 — Os itens andam com o ativo

> Ordem de 28/08/2026, emitida pelo Johnny. Sucede a **F37** (`docs/RELATORIO-F37.md` · **v1.42.0**, migrations `0112`/`0113`/`0114`) e a revisão de código que a fechou (**v1.42.1**, migration `0115`). O **o quê** e o **porquê** desta fase estão em `@docs/PLAN-F36-F39.md` **§5** (decisões **D4**, **D12**, **D13** do §1) — **leia o §5 inteiro, mais o §2.2, antes de planejar**; esta ordem é a execução dele e, onde as duas divergirem, **esta ordem manda** (emende o plano e registre em `docs/DECISOES.md`). Na escrita desta ordem a última migration era a **`0115`** e a versão no ar, **`1.42.1`**: **confira os números livres reais antes de começar**; colisão → renumere (precedente F19/F20B) e registre. Se `git status` mostrar trabalho não commitado de outra sessão, PARE e reporte (uma ordem por vez) — **exceto o próprio arquivo desta ordem**, que é insumo da fase: commite-o no primeiro commit.
>
> **As três pontas soltas do plano foram fechadas pelo Johnny em 28/08/2026, e são decisão dele, não sua** — estão nos §E, §B.2 e §0 desta ordem: (1) o ciclo da pendência de item **fecha nos dois desfechos**; (2) o lote passa a ser **tudo-ou-nada de verdade**, painel de sucesso parcial revisto; (3) a **curva de desempenho da F37 é a primeira frente desta fase**, e é ela que autoriza (ou não) o índice de saldo por pessoa.

## Missão

Hoje o acessório e o equipamento vivem em dois mundos que não se falam: `lancamentos_item` não tem elo nenhum com `movimentacoes` (só o texto `chamado`), não existe conta por pessoa, o checklist de devolução são 7 códigos fixos no código que não tocam o estoque, e o lote de movimentação commita linha a linha. Esta fase junta os dois mundos:

- **0 — A curva primeiro (D6, pendência nº 1 da F37).** Rodar a medição dos três patamares no ensaio e publicar o número. É ele que decide o índice de saldo por pessoa — nenhuma otimização entra sem ele.
- **A — O vínculo.** `lancamentos_item.movimentacao_id`: "o que foi junto com este notebook" vira um join, não um palpite sobre o campo `chamado`.
- **B — A RPC transacional.** Movimentações do lote **e** os lançamentos de item numa transação só, tudo-ou-nada — e o defeito conhecido do lote (metade gravada) morre junto.
- **C — Saldo por colaborador.** `com_a_pessoa = Σ saida(colaborador_id) − Σ retorno(colaborador_id)`, uma partição das fórmulas da `0027` — nenhum número que a tela de itens mostra hoje muda.
- **D — O checklist vira o catálogo (D12).** A lista sai de `tipos_item` (F37) e cada linha tem **dois** desfechos: *Devolvido* repõe o estoque e baixa da conta da pessoa; *Faltante* abre a pendência exatamente como hoje.
- **E — O ciclo da pendência fecha (decisão do Johnny, 28/08/2026).** `recuperado` → `retorno`; `baixa` → `retorno` **+** `ajuste` negativo. Sem isso, item dado como perdido fica na conta da pessoa para sempre.

**O termo NÃO é tocado aqui.** A F38 entrega o dado; a F39 o imprime.

## Contexto (leia a origem, não descrições dela)

- **Fonte do escopo:** `@docs/PLAN-F36-F39.md` §1 (D4, D12, D13), **§2.2** (o que o código faz hoje — verificado, não presumido), **§5** (o desenho desta fase), §7 (rollout), §8 (versão), §9 (o que o plano NÃO faz). E `@docs/RELATORIO-F37.md` **§9** (as seis pendências nomeadas que a F37 deixou — a nº 1 é a frente 0 desta ordem, e a nº 5 é regra para quem escrever roteiro).
- Doutrina: `@CLAUDE.md` (modo autônomo; stack fechada; a árvore prescrita — que esta ordem emenda; regra 8 do versionamento; modelo de acesso) · `@docs/ESPECIFICACAO.md` §5/§6/§7/§8 · `@docs/RUNBOOK-BANCO.md` (**caminho A**; a regra F17: rode TODOS os roteiros SQL ao mexer em função/trigger; as armadilhas do bloco de grants do `papeis_rls.sql`).
- **A aritmética que governa esta fase inteira:** o cabeçalho da `@supabase/migrations/0027_itens_total_estoque.sql` (Total / Estoque / Atrelados / Liberados / Falta, com a nota sobre `falta` e o drift da OS). **Leia-o antes de escrever uma linha de SQL** — toda a §C e a §E desta ordem são partições daquelas fórmulas, e inventar uma sexta fórmula é o erro que o `CLAUDE.md` proíbe.
- **O precedente EXATO da RPC transacional** — leia o cabeçalho inteiro, não só o corpo: `@supabase/migrations/0104_transferir_item.sql` (`transferir_item`, F31). Ele traz de graça as quatro lições que a §B precisa: **SECURITY INVOKER é a autorização** (a policy `"operador lanca"` avaliada linha a linha), **a trava em ordem determinística `(item_id, filial_id)` antes do primeiro INSERT** (senão deadlock — a mesma classe de bug que a `0100` teve de consertar em produção), **não redigir texto dentro da função**, e **não recalcular saldo por conta própria** (quem valida é o trigger, sob a trava). Precedentes irmãos: `criar_compra_lote` (`0008` → `0064`) e `devolver_ao_fornecedor` (`0045` → `0047`).
- **O que hoje commita linha a linha:** `@src/lib/actions/movimentacoes.ts` (`registrarMovimentacoes`, o `for` do lote — o comentário da linha 126 diz por escrito que "as linhas anteriores já estão commitadas") e `@src/lib/actions/itens.ts` (`lancarItens`, o carrinho). O painel que mostra o resultado parcial é `@src/components/movimentacoes/nova/painel-sucesso.tsx`. Isto também é o item **U** da `@docs/DIVIDA-TECNICA.md` ("Escrita em duas etapas sem transação", `[Prio 12]`, inalterado) — abata o que couber e diga no relatório o que sobrou.
- **A guarda que já mora no trigger:** `valida_lancamento_item` (nasce na `0015`, corpo vigente na `@supabase/migrations/0104_transferir_item.sql`; passou também por `0019`, `0024`, `0027`, `0064`, `0068`, `0084`). A **primeira linha do corpo** é `perform pg_advisory_xact_lock(new.item_id::int, new.filial_id::int)` — ela é a razão da ordem determinística da §B e **não pode sair**.
- **Onde a pendência de item nasce e morre:** `@supabase/migrations/0050_pendencias_item.sql` (tabela, e por que a FK é `deferrable`), `0051` (o trigger `before insert` em `movimentacoes` que a alimenta a partir de `movimentacoes.itens_faltantes`), `0052` (leitura), `0103`/`0107` (reabertura). Ações: `@src/lib/actions/pendencias.ts` (`resolverPendenciaItem`, `reabrirPendenciaItem` — leia os comentários sobre idempotência e corrida).
- **O checklist de hoje:** `@src/components/movimentacoes/nova/checklist-faltantes.tsx` + `ACESSORIOS_DEVOLUCAO`/`ACESSORIO_ROTULO`/`rotuloAcessorio` em `@src/lib/dominio.ts`, e o espelho no banco que a F37 criou (`tipos_item`, migration `0114`) com a **guarda TS↔SQL** que trava os dois lados.
- **O vínculo de pessoa que a F37 entregou:** `@src/lib/colaboradores/chave.ts` (a chave normalizada, espelho exato de `public.colaborador_chave`), `resolverColaboradoresPorNome` em `@src/lib/queries/colaboradores.ts`, o campo `@src/components/movimentacoes/nova/campo-colaborador.tsx`. **Nenhum id viaja pelo formulário** — o id é resolvido no servidor, pela chave do próprio texto. Mantenha essa doutrina.
- **O harness da medição:** `@scripts/perf/medir-itens.mjs` e o comando exato no §6.1 do `@docs/RELATORIO-F37.md`. Guardas: `@scripts/env-guard.ts` (`REFS_DE_PRODUCAO`) e `assertBancoDeEnsaio`.
- **Guardas que VÃO reclamar (F20/F27):** mapa rota→página de ajuda em `@src/lib/ajuda/registry.test.ts`, jargão de dev, título de aba, paleta `Ctrl+K` (`@src/components/layout/paleta-comandos.tsx`), smoke (`@scripts/smoke/smoke-prod.mjs`). Leia-os **antes** de criar rota.
- **A lição do teto de 1.000 linhas** (`@docs/RELATORIO-CORRECAO-TRUNCAMENTO-1000.md`): nenhuma contagem desta fase pode nascer de leitura truncada. Agregue **no SQL**.
- Comandos: `npm run lint` · `npm run test` · `npm run build` · `npm run db:types` · `npm run db:seed` / `db:reset` (só ensaio/local). **Meça a baseline ANTES de mudar qualquer coisa** e cole no relatório.
- APIs (regra 6 do `CLAUDE.md`): precisou conferir Supabase/Next 16/React 19 — doc oficial vigente via MCP Context7, nunca de memória.

## Escopo

**Dentro:** a curva de desempenho dos três patamares publicada; migrations `0116` (vínculo `movimentacao_id` + índice de FK), `0117` (RPC `criar_movimentacao_com_itens`), `0118` (`rel_saldo_colaborador` + a guarda de retorno por pessoa no `valida_lancamento_item`) e `0119` (o ciclo da pendência), com RLS e grants; a seção de itens no wizard de movimentação (entrega e devolução) com a escolha de D13; o checklist de dois desfechos; o bloco "Com esta pessoa"; a leitura "o que foi junto"; o estorno acoplado; o painel de sucesso revisto; roteiro SQL `supabase/tests/f38_itens_com_ativo.sql`; ajuda, paleta, smoke, título de aba; versão **1.43.0** (bump + registry + tag); emendas de documentação; encerramento padrão (§R e relatório).

**Fora (não toque):**

- **Os termos e os 7 `.docx`.** `src/lib/actions/termos.ts`, `src/lib/termos/**` e `src/templates/termos/**` ficam como estão — inclusive `{outros_componentes}`, que continua saindo `''`. É a F39, e antecipá-la aqui é o risco nº 1 desta ordem (§5.5 do plano).
- **`ACESSORIOS_DEVOLUCAO` não é removido nesta fase.** Ele **deixa de governar o checklist** (§D), mas **continua vivo** como o fallback de rótulo do histórico (`movimentacoes.itens_faltantes`, `pendencias_item.item`, `src/lib/ajuda/derivacao.ts`, `src/lib/termos/devolucao.ts`) — e a guarda TS↔SQL da F37 continua provando que os dois lados são o mesmo conjunto. A remoção da constante é da F39.
- **`aplicar_movimentacao`, `status_apos_movimentacao`, `status_tem_detentor`, `rel_estoque_asof`, `guarda_acervo`, o trigger `0051` da pendência e `rel_saldo_itens`** ficam **byte a byte** (prove por `pg_get_functiondef`/md5 antes e depois). A **única** função existente que esta fase recria é `valida_lancamento_item`, e só pela §C.3.
- **Nenhum valor novo no enum** `tipo_lancamento` nem em `tipo_movimentacao`. Entrega é `saida`, devolução é `retorno` — os dois já existem (`retorno` desde a `0027`). Se você se pegar escrevendo `alter type … add value`, o desenho saiu do trilho: **pare e repense**.
- **UPDATE ou DELETE em `movimentacoes` / `lancamentos_item`** por qualquer caminho, service role incluso — `guarda_acervo` (`0081`) recusa, e é assim que deve ser. Correção é **lançamento inverso apontando `estorna_id`**, nunca edição.
- **Otimização sem número.** O índice de saldo por pessoa só entra se a curva da frente 0 o justificar (D6). Nenhum saldo materializado, nenhum cache, nenhuma paginação nova nesta fase.
- Máquina de estados, modelo de acesso (nenhum cargo novo, nenhuma policy sobre tabela existente além do que a §A exigir), `ativos.colaborador_atual` (continua texto — pendência nº 3 da F37), relatórios e snapshots, visualizador por senha, `src/components/ui/**`, dependência nova, custo acima de R$ 0, dado real em qualquer lugar.

## O modelo a implementar

### 0 — A curva, antes de qualquer índice (D6 · pendência nº 1 da F37)

**Primeira coisa da fase, antes de escrever migration.** O harness está escrito, as três guardas estão provadas e o ensaio está no ar; falta rodá-lo até o fim. Comando e contexto no §6.1 do `docs/RELATORIO-F37.md`.

- Três patamares — **10 mil, 100 mil e 500 mil** lançamentos fictícios — medindo `rel_saldo_itens`, `rel_mov_itens`, o custo por INSERT do trigger `valida_lancamento_item` e o histórico paginado.
- **O tempo de POPULAR é dado, não obstáculo** (a F37 mediu 7,1 s para 2.000 linhas, dominado por round-trip de API): se um patamar ficar inviável, **isso é o achado** — registre o número real e o método, e siga com os patamares que deram.
- **Limpeza obrigatória, conferida e não presumida.** O ensaio volta ao estado anterior, com contagem antes/depois no relatório. A F37 ensinou como se apaga: a `guarda_acervo` recusa o DELETE fora da janela `estoque.dev_destrutivo`. Se a limpeza falhar, é a pendência nº 1 do seu relatório, escrita em voz alta.
- **Nunca contra produção**, por nenhum caminho de ambiente.
- **O entregável é o número, e ele decide uma coisa só nesta fase:** se o índice `lanc_item_colaborador_idx (colaborador_id, item_id, filial_id)` da §C entra ou não. Índice que a curva não justificar **não entra** — e o relatório diz isso com o número na mão.

### A — O vínculo que não existe (migration `0116`)

```sql
alter table public.lancamentos_item
  add column movimentacao_id uuid references public.movimentacoes (id);
create index lanc_item_mov_idx on public.lancamentos_item (movimentacao_id);
```

- **Só `movimentacao_id`, nunca `ativo_id`.** A movimentação já aponta o ativo; uma segunda cópia da mesma verdade é um lugar novo para as duas discordarem. "O que foi junto com este notebook" é um **join**.
- **FK imediata, não `deferrable`.** Em `pendencias_item` (`0050`) a FK precisou ser adiada porque quem insere é um trigger `before insert` em `movimentacoes` — a linha ainda não está na heap. Aqui não: a RPC da §B insere a movimentação **antes** dos itens, na mesma transação. **Confirme isso lendo o código antes de aceitar como verdade.**
- **O índice de FK acompanha a coluna** — é estrutural (precedente `0106`, "índices de FK de movimentações"), não otimização; ele existe para o join e para o `on delete` das ferramentas do `/dev`. Não confunda com o índice de saldo por pessoa da §C, que **depende da curva**.
- Coluna **anulável e sem default**: todo lançamento de hoje continua válido, e o lançamento avulso da tela de itens (que não nasce de movimentação nenhuma) continua nascendo com ela nula. **Nenhum registro histórico é alterado.**
- **D13 se materializa aqui:** cada linha de item aponta **uma** movimentação do lote — o fone aponta a do notebook, o cabo aponta a do monitor.

### B — A RPC transacional (migration `0117`) — e o fim do sucesso parcial

`criar_movimentacao_com_itens(p_movimentacoes jsonb, p_itens jsonb, …)` grava o lote de movimentações **e** os lançamentos de item **tudo ou nada**.

**B.1 — `security invoker`, declarado na cara.** Como `criar_compra_lote`, `devolver_ao_fornecedor` e `transferir_item`: a RLS e as policies de filial continuam sendo a autorização, avaliadas linha a linha. ⚠ Detalhe a corrigir de passagem: as três são invoker **por omissão da cláusula**, não por declaração — as de leitura (`0011`, `0016`) escrevem `security invoker` explicitamente. **A sua declara a palavra.** Guardas `pode_escrever_filial` no corpo são cinto-e-suspensórios **pela mensagem**, não pela segurança (leia o cabeçalho da `0104` sobre o `42501` cru que a UI traduz como conselho errado).

**B.2 — Tudo-ou-nada no lote INTEIRO (decisão do Johnny, 28/08/2026).** Num lote de 30 ativos, um patrimônio ruim passa a derrubar os 29 bons — e é isso que ele quer. Consequências que **entram como item explícito da ordem, não como efeito colateral**:

- O **painel de sucesso parcial deixa de existir para este caminho**. Reescreva o texto: nada foi gravado, qual linha falhou, por quê, e o que fazer. O componente `painel-sucesso.tsx` e os testes dele mudam junto.
- **Valide antes de gravar.** O passo de revisão do wizard confere o lote inteiro (patrimônio existe, estado permite a transição, filial) e mostra o que vai falhar **antes** de o operador submeter — para ele corrigir antes, em vez de perder o lote depois. Isso não substitui a validação do banco; é a primeira linha, e a do banco continua sendo a que vale.
- O caminho **avulso** da tela de itens (`lancarItens`, o carrinho sem movimentação) **continua linha a linha como hoje** — lá as linhas não se relacionam entre si, e o cabeçalho de `transferirItens` já explica por que os dois desenhos coexistem de propósito. Não unifique.

**B.3 — A trava, em ordem determinística, antes do primeiro INSERT.** A primeira linha de `valida_lancamento_item` é `pg_advisory_xact_lock(item_id, filial_id)`. Gravando várias linhas de item na mesma transação, isso são N travas adquiridas na ordem dos INSERTs — dois lotes simultâneos com os itens em ordens diferentes se travam mutuamente. **A RPC adquire TODAS as travas, ela mesma, em ordem total crescente `(item_id, filial_id)`, antes do primeiro INSERT** (advisory locks são reentrantes na mesma sessão). É o passo 5 da `0104`, pela mesma razão, e o roteiro SQL da fase trava isso.

**B.4 — Sem enum novo, sem fórmula nova.** Entrega → `saida` ("Liberação") com `colaborador_id` e `movimentacao_id`. Devolução → `retorno` ("Retorno"). Os dois já existem. A RPC **não recalcula saldo** — quem valida é o trigger, sob a trava, e ele é a fonte da verdade. Uma segunda conta de estoque dentro da função seria uma segunda definição da mesma regra.

**B.5 — O estorno passa a desfazer o conjunto.** Estornar uma movimentação que carregou itens hoje deixaria o lado do item registrado — "desfazer" que não desfaz. Portanto: o estorno grava, **na mesma transação**, os lançamentos inversos dos itens vinculados àquela movimentação (`estorna_id` apontando o original — `lanc_item_estorna_uidx` garante uma vez só, e `estorno_item_coerente` da `0068` continua valendo). O diálogo de confirmação diz o efeito inteiro ("desfaz a movimentação e devolve 2 lançamentos de item"). Se algum inverso não puder ser gravado, **o estorno inteiro recusa** com a mensagem em pt-BR do motivo verdadeiro e o caminho de saída — nunca meio estorno. Ata obrigatória.

### C — Saldo por colaborador (migration `0118`)

**C.1 — A conta é uma partição, não uma fórmula nova.** Sobre as derivações da `0027`:

```
com_a_pessoa(item, filial, colaborador) = Σ saida(colaborador_id) − Σ retorno(colaborador_id)
```

Somando todas as pessoas **mais** os lançamentos sem vínculo, dá exatamente o `liberados` de hoje. **Nada do que a tela de itens mostra muda de número** — prove isso com uma contagem antes/depois, não com uma frase.

**C.2 — A leitura.** `rel_saldo_colaborador(p_colaborador uuid)`, `security invoker`, no molde das `rel_*` existentes (grants sem `anon` — precedente `0056`). Ela alimenta um bloco **"Com esta pessoa"** em `/admin/colaboradores` e no diálogo de devolução. **Sem rota nova, se der:** a rota nova acorda os guardas F20/F27 inteiros (ajuda, paleta, título, smoke) e a fase não precisa disso — prefira expandir a linha da tabela ou um diálogo. Criou rota mesmo assim? Então **todos** os guardas se aplicam.

**C.3 — A guarda nova no trigger — a ÚNICA função existente que esta fase recria.** Espelho exato da guarda que já existe para `liberacao` contra `reserva`: **um `retorno` que nomeia uma pessoa não pode exceder o que aquela pessoa tem** daquele item naquela filial.

- ⚠ **Base da recriação: o corpo VIGENTE lido do banco por `pg_get_functiondef`, com o md5 registrado na migration** — nunca o arquivo de uma migration antiga. É a lição escrita na `0047` e repetida na `0109`, e é ela que impede regressão silenciosa. A primeira linha (`pg_advisory_xact_lock`) e toda a aritmética existente saem **byte a byte**; o que entra é um bloco novo.
- **Retorno SEM `colaborador_id` continua valendo exatamente como hoje** — é o caminho de todo o histórico, e ele não pode virar erro retroativo.
- ⚠ **A armadilha que esta guarda cria, e a regra que a desarma:** equipamento entregue **antes** desta fase não tem `saida` vinculada a ninguém, então a pessoa tem saldo **zero** — e uma devolução conferida pelo checklist (§D) seria **recusada**. Isso mataria o D12, cujo ponto é justamente "entrega antiga funciona igual". Portanto, e isto **é decisão desta ordem**: **a linha de devolução só carrega `colaborador_id` quando a pessoa tem saldo registrado suficiente daquele item naquela filial; não tendo, o `retorno` é gravado sem o vínculo** — repõe o estoque igual, sem inventar dívida nem recusar a conferência. A tela diz, discretamente, qual dos dois aconteceu. Ata obrigatória.

### D — O checklist da devolução vira o catálogo (D12)

Hoje: 7 códigos fixos em `dominio.ts`, marcar = **faltante**, nada toca o estoque. Depois: a lista vem de **`tipos_item`** (F37) e cada linha tem **dois** desfechos:

| Marca | Efeito |
|---|---|
| **Devolvido** | Lançamento `retorno` → repõe o estoque da filial e baixa da conta da pessoa (com a regra da §C.3 sobre o vínculo) |
| **Faltante** | `pendencias_item` aberta **exatamente como hoje** (`0050`/`0051`), e o item **continua** na conta da pessoa |

- ⚠ **O caminho "Faltante" não muda uma vírgula do banco.** Quem cria a pendência é o trigger `0051`, lendo `movimentacoes.itens_faltantes`. Esse array continua sendo gravado como hoje, com **os mesmos slugs literais**, e o trigger **não é recriado**. Só a origem da *lista exibida* muda.
- ⚠ **A ponte que falta, e que esta ordem fecha:** a linha do checklist é um **TIPO**; o lançamento precisa de um **ITEM do catálogo**. Regra: tipo com **exatamente um** item de catálogo ativo naquela filial resolve sozinho; **zero ou mais de um**, a linha pergunta qual (combobox restrito àquele tipo e filial). "Devolvido" sem item resolvível **não bloqueia a devolução** — ela é registrada, o lançamento não nasce, e a tela diz por quê ("nenhum item de catálogo deste tipo nesta filial"). Ata obrigatória.
- **Entrega antiga funciona igual**, e é por isso que o D12 escolheu mostrar os tipos do catálogo e não "o que esta pessoa recebeu".
- **Quantidade 1 por linha marcada** — o checklist é booleano, e continua sendo. Quantidade livre é outra fase.

### E — O ciclo da pendência fecha (migration `0119` · decisão do Johnny, 28/08/2026)

Resolver a pendência em `/pendencias` passa a virar lançamento. **A aritmética é a da `0027` e precisa sair exata** — confira-a contra o cabeçalho daquela migration antes de implementar:

| Desfecho | Lançamentos gravados | Efeito líquido |
|---|---|---|
| `recuperado` | `retorno` 1 (com o vínculo, pela regra da §C.3) | Estoque **+1** · conta da pessoa **−1** · Total **inalterado** — o item voltou |
| `baixa` | `retorno` 1 (com o vínculo) **+** `ajuste` **−1** | Conta da pessoa **−1** · Total **−1** · Estoque **volta ao que era** — o item saiu do mundo |

- ⚠ **Por que a `baixa` são DOIS lançamentos, e não um `ajuste` só:** `com_a_pessoa` conta `saida − retorno`; `ajuste` não entra nessa conta (`0027`). Um `ajuste` negativo sozinho tiraria do Total e deixaria o item **na conta da pessoa para sempre** — exatamente o furo que esta frente existe para fechar. É a mesma lógica que a `0104` usou para provar que só o par de ajustes preserva o Total.
- O `ajuste` exige justificativa não vazia (`lanc_item_ajuste_obs`): use a observação da resolução; vazia, componha um texto padrão em `src/lib/` (função pura, testada — **nunca dentro da função SQL**, lição da `0104`).
- **A pessoa vem do texto da pendência** (`pendencias_item.colaborador` é snapshot da época), resolvida por chave via `resolverColaboradoresPorNome`. Sem cadastro correspondente → sem vínculo, e o lançamento é gravado assim mesmo.
- **O item vem do slug** `pendencias_item.item`, que é um tipo — vale a **mesma ponte tipo→item da §D**, com o mesmo desfecho quando não resolve: a pendência **é resolvida do mesmo jeito**, o lançamento não nasce, e a tela diz por quê. Resolver pendência **nunca** pode falhar por causa do catálogo.
- **Tudo-ou-nada e resistente a corrida:** `resolverPendenciaItem` hoje é em **lote** (`ids[]`) e **idempotente** (`eq('status','aberta')`) — leia os comentários dele antes de mexer. A resolução e os lançamentos vão numa transação só, com as travas em ordem determinística `(item_id, filial_id)` (§B.3). Reenviar continua não re-resolvendo **nem duplicando lançamento**.
- **Reabrir desfaz (`reabrirPendenciaItem`, F28/PND-05).** Reabrir uma pendência que gerou lançamento grava os **inversos** (`estorna_id`), na mesma transação. Não sendo possível, **recusa** com o motivo em pt-BR — nunca reabre deixando o lançamento de pé. Ata obrigatória.
- ⚠ **A `baixa` mexe no Total da TI.** Está certo (o item deixou de existir), mas é número visível: meça o Total por filial **antes e depois** do rollout e registre.

### F — O que aparece na tela

- **No wizard, na entrega** (`saida`/`emprestimo`): seção opcional "Itens que vão junto" — combobox do catálogo da filial, quantidade, e a escolha do **D13**: com vários equipamentos no lote, o operador escolhe a qual deles cada periférico acompanha (**padrão: o primeiro**). Vazia, nada muda no fluxo de hoje.
- **Na ficha do ativo e na movimentação:** "o que foi junto" pelo join de `movimentacao_id` — na linha do tempo (`src/components/ativos/linha-do-tempo.tsx`) e no detalhe da movimentação.
- **"Com esta pessoa":** bloco em `/admin/colaboradores` e no diálogo de devolução, alimentado por `rel_saldo_colaborador`.
- **A honestidade que a F37 instalou continua:** enquanto houver lançamento antigo sem vínculo, a tela **diz na cara** quantos são, em vez de fingir um total completo. Contagem **agregada no SQL** (lição do teto de 1.000).
- **Rascunho, "repetir última", kits e resumo de revisão continuam funcionando.** Os testes existentes desses fluxos passam **sem edição**, salvo os do painel de sucesso, que mudam por decisão explícita (§B.2).

### G — Versão e emendas de documentação

Versão **`1.43.0`** pela regra 8 do `CLAUDE.md`, sem reinterpretação: bump só do campo `version`; entrada nova no topo de `src/lib/versoes/registry.ts` (data, `fase: 'F38'`, título e **2 a 6 mudanças em linguagem de operador** — "Ao devolver o equipamento, marcar o que voltou repõe o acessório no estoque na hora"; há teste que recusa jargão); entrada nova no topo do `CHANGELOG.md`; **tag anotada `v1.43.0` publicada**. Emende ainda: a **árvore prescrita do `CLAUDE.md`** (sem isso a F39 PARA ao ver a estrutura divergir), spec §5/§6/§7/§8, `README.md`, `docs/prompts/README.md` (linha F38), `docs/PLAN-F36-F39.md` (marque o §5 como executado e registre as decisões desta ordem que o emendam) e `docs/DECISOES.md` — **uma ata por decisão**: lote tudo-ou-nada e o painel revisto · o vínculo condicional do retorno (§C.3) · a ponte tipo→item (§D) · a `baixa` em dois lançamentos (§E) · o estorno acoplado (§B.5) · a reabertura que desfaz · o que a curva decidiu sobre o índice.

## Critérios de aceitação

1. **A curva existe.** Os patamares medidos estão em `docs/RELATORIO-F38.md` com o JSON em `docs/perf/`; o ensaio voltou ao estado anterior (contagem antes/depois **conferida**, não presumida); e o relatório diz, **com o número na mão**, se o índice de saldo por pessoa entrou ou não. Patamar que não deu, deu por escrito com o motivo.
2. **O join responde a pergunta.** "O que foi junto com este notebook" sai de um join por `movimentacao_id`, e a ficha do ativo mostra isso. `ativo_id` **não** existe em `lancamentos_item`.
3. **Tudo-ou-nada de verdade.** Um lote com uma linha inválida grava **zero** movimentações e **zero** lançamentos — provado por roteiro SQL e por teste de action, com contagens antes/depois. O painel de sucesso foi reescrito e nenhum texto promete sucesso parcial que não existe mais. O carrinho avulso da tela de itens continua linha a linha.
4. **Sem deadlock por construção.** A RPC adquire todas as travas em ordem crescente `(item_id, filial_id)` antes do primeiro INSERT, e o roteiro SQL prova que a ordem não é "a que o operador digitou".
5. **Nada do que a tela de itens mostra mudou de número.** Total, Estoque, Atrelados, Liberados e Falta por item×filial são **idênticos** antes e depois da fase para os dados existentes (contagem colada no relatório). A soma de `com_a_pessoa` de todas as pessoas mais os sem vínculo **é** o `liberados`.
6. **A guarda nova não fecha nenhuma porta antiga.** `retorno` sem `colaborador_id` continua passando; devolução de equipamento entregue **antes** desta fase é conferível e repõe o estoque (a linha sai sem vínculo, pela §C.3); nenhum lançamento histórico virou inválido.
7. **O checklist é o catálogo, e o "Faltante" é byte a byte.** A lista exibida vem de `tipos_item`; `movimentacoes.itens_faltantes` continua gravando os mesmos slugs; o trigger `0051` **não foi recriado**; a pendência nasce exatamente como hoje. "Devolvido" gera `retorno` quando o tipo resolve um item, e não bloqueia quando não resolve.
8. **O ciclo fecha e a aritmética bate.** `recuperado` → estoque +1, pessoa −1, Total inalterado. `baixa` → pessoa −1, Total −1, estoque de volta ao que era. Provado por roteiro SQL com os números nas duas pontas. Reabrir grava os inversos ou recusa — nunca deixa lançamento órfão.
9. **Só uma função existente foi recriada.** `git diff` e `pg_get_functiondef`/md5 provam que `aplicar_movimentacao`, `status_apos_movimentacao`, `status_tem_detentor`, `rel_estoque_asof`, `rel_saldo_itens`, `guarda_acervo` e o trigger `0051` saíram **byte a byte**; só `valida_lancamento_item` mudou, e sobre o corpo lido do banco. **Nenhum valor novo de enum.** **Nenhum UPDATE/DELETE em histórico**, por nenhum caminho (`grep` por `.update(`/`.delete()` sobre `movimentacoes`/`lancamentos_item` em `src/` e `scripts/` volta vazio).
10. **Acesso:** operador escreve só nas filiais vinculadas, e isso vale **dentro** da RPC (invoker, policy linha a linha); consulta não escreve nada; perfil desativado ou arquivado não lê nem escreve. Provado no `papeis_rls.sql`, com as relações e funções novas **dentro** do bloco de grants (armadilha `42501` do runbook).
11. **Portões:** `npm run lint` · `npm run test` · `npm run build` limpos (baseline antes, colada no relatório); **TODOS** os roteiros de `supabase/tests/*.sql` rodados (regra F17), job `banco` do CI verde, deploy READY, smoke pós-deploy OK, `npm run db:types` regenerado e commitado.
12. **Versão e relatório:** `1.43.0` no `package.json`, no registry e na tag anotada publicada; `docs/RELATORIO-F38.md` com o checklist autoverificado item a item, evidências reais (saídas de comando, contagens, `EXPLAIN ANALYZE`), decisões, pendências e a seção **"o que este relatório NÃO prova"**.

## §V — Verificação (rode de verdade, itere até passar)

Meça a **baseline** antes de qualquer mudança: `lint`/`test`/`build`, contagem de testes, e as contagens só-leitura de produção que esta fase promete não mexer — `ativos`, `movimentacoes`, `lancamentos_item`, `itens`, `pendencias_item`, mais **Total/Estoque/Liberados por item×filial** (é a prova do critério 5) e o **Total da TI por filial** (é a prova do §E). Cole tudo no relatório.

A cada incremento: `npm run lint && npm run test && npm run build` — leia a falha, corrija a **causa raiz**, repita. Nunca suprima erro, nunca desabilite, pule ou delete teste para passar; teste existente só muda quando a decisão explícita da §B.2 o exige, e isso vai nomeado no relatório.

Banco pelo **caminho A** do runbook: aplique em **ensaio** primeiro, rode **todos** os roteiros SQL lá (`begin; … rollback;`, comparando **linhas** de uma `select` final — o MCP engole `NOTICE`), confira `get_advisors`, e só então produção; a prova final é o job `banco` **verde** no GitHub, não o run no ensaio. ⚠ Regra da pendência nº 5 da F37, que vale para todo roteiro novo: **duas movimentações do mesmo ativo na mesma transação precisam de `created_at` explícito e distinto**, senão o desempate cai num sorteio de uuid e o roteiro fica intermitente.

Suba o dev server e percorra os quatro caminhos nos dois temas: entrega com itens junto (lote de 2+ equipamentos, exercitando a escolha do D13) · devolução com o checklist de dois desfechos (um tipo que resolve item, um que não resolve) · resolução de pendência nos dois desfechos, com os números conferidos antes e depois · estorno de uma movimentação que carregou itens.

Ao final, **revisão adversarial em contexto fresco** contra esta ordem, refutação por padrão, atenção especial a: sobrou algum `create or replace` de função existente além do `valida_lancamento_item`?; algum `alter type … add value` entrou?; a ordem das travas na RPC é determinística **e** anterior ao primeiro INSERT?; existe caminho em que meio lote fica gravado?; a devolução de equipamento **antigo** (pessoa com saldo zero) é recusada em algum lugar?; a `baixa` deixa o item na conta da pessoa?; reabrir pendência deixa lançamento órfão?; algum número da tela de itens mudou para os dados existentes?; alguma contagem nasce de leitura truncada em vez de agregação no SQL?; algum índice entrou sem a curva justificar?; o texto do painel promete sucesso parcial que não existe mais?; a árvore do `CLAUDE.md` bate com a estrutura real **depois** da fase? Aponte só lacunas de correção ou de requisito, não estilo — corrija e re-revise até limpar.

## Como trabalhar

Explore com subagentes paralelos (a curva e o harness; a aritmética da `0027` e o corpo vigente de `valida_lancamento_item` lido do banco; o caminho de escrita do lote e o painel de sucesso, com os testes que o cercam; a pendência de item da `0050` à `0107`, incluindo reabertura; o checklist, `tipos_item` e a guarda TS↔SQL da F37) e escreva um `PLAN.md` autossuficiente antes de implementar — com o DDL final das quatro migrations, a assinatura das RPCs, as policies nome a nome, a tabela de aritmética do §E conferida contra a `0027`, e a lista dos testes existentes que **não** podem mudar (e dos poucos que mudam, com o porquê).

Implemente em incrementos testáveis e independentes, nesta ordem — ela é escolhida para dar rollback limpo: **curva** → `0116` vínculo → `0117` RPC + wizard + painel revisto → `0118` saldo por pessoa + guarda no trigger → checklist de dois desfechos → `0119` ciclo da pendência + reabertura → leituras de tela → versão e documentação. Verifique a cada um. As frentes C e D só correm em paralelo até tocarem o diálogo de devolução, que é ponto de encontro: sincronize ali. A revisão adversarial final é a do §V.

## Autonomia, decisões e git

Você está rodando em modo autônomo (`CLAUDE.md`): ninguém vai responder perguntas — não pare para perguntar nem espere confirmação. Régua: (1) esta ordem; (2) `docs/PLAN-F36-F39.md` §5, a spec e as convenções do repositório; (3) opção **mais simples e reversível**, registrada. Toda decisão não-óbvia vira ata em `docs/DECISOES.md` (data · contexto · escolha · motivo). Falha persistindo após ~3 tentativas: **mude de abordagem** e registre a troca. Bloqueio real (ensaio fora do ar, MCP indisponível): contorne se for seguro; senão siga com o resto da fase e registre a pendência com o que falta para resolver — **nunca** force a mão em produção para destravar. Git: commits pequenos e frequentes em pt-BR (`feat(f38): …`, `fix(f38): …`), direto na `main` ou em branch `f38` com merge próprio ao fechar o checklist; NUNCA force push, `reset --hard`, `git checkout -- .`, deleção de teste para passar, `.env*` ou dado real em commit.

## §R — Rollout

1. **Banco pelo caminho A** (nenhuma das quatro bate no gate — nenhuma contém `delete from public.ativos` ou `delete from public.movimentacoes`): ensaio → roteiros SQL → `get_advisors` → produção → `notify pgrst, 'reload schema';` → conferência pós-apply (a coluna e o índice existem, as RPCs existem com a assinatura prevista, os grants estão como o desenho previu, o md5 das funções intocadas é o mesmo de antes).
2. **Ordem migration → deploy:** o SQL entra **antes** do deploy da Vercel, porque o código novo lê coluna e chama RPC que só existem depois dele.
3. CI verde (lint + test + build + job `banco`), deploy READY, smoke pós-deploy, conferência das telas tocadas nos dois temas.
4. **Contagens de fechamento**, lado a lado com a baseline: acervo intacto; Total/Estoque/Liberados por item×filial idênticos; Total da TI por filial (que só muda se alguém der `baixa` numa pendência depois do deploy — e aí muda de propósito).
5. Tag anotada `v1.43.0` publicada apontando para o commit deployado.
6. Encerramento: `docs/RELATORIO-F38.md` (checklist autoverificado, evidências, a curva, a tabela de aritmética conferida, decisões, pendências, "o que este relatório NÃO prova") + todas as emendas de documentação + resumo final de ~10 linhas em pt-BR na resposta.

## Idioma

Narrativa, atas, relatório e UI em **pt-BR**; identificadores de domínio em português sem acento (`movimentacao_id`, `colaborador_id`, `lancamentos_item`, `criar_movimentacao_com_itens`, `rel_saldo_colaborador`); utilitários e infra em inglês; commits em pt-BR no padrão conventional da casa.
