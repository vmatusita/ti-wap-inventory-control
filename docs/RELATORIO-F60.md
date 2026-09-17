# Relatório F60 — O recorte que corta scan, e o custo do caminho quente

**v1.65.0** · **migrations `0141`–`0145` aplicadas no ensaio e em produção** · 17/09/2026 · SHA de código congelado
**`c516467`** · código no [PR #52](https://github.com/vmatusita/ti-wap-inventory-control/pull/52) (merge `51b2886`) ·
documentação no PR de fecho, com a tag anotada `v1.65.0` no merge dele

> As sete leituras de relatório que recortavam por filial com "nulo = tudo" — `(p_filial is null or col = p_filial)`, a
> forma que a R-ACC-71 proíbe — foram substituídas por `rel_*_filiais(p_filiais smallint[], …)`, com o recorte ligado por
> `col = any (p_filiais)`: NULL e `'{}'` devolvem 0 linhas, e o consolidado é a lista EXPLÍCITA de todas as filiais,
> inclusive desativada. As velhas saíram de produção depois do deploy e da prova, pelo `pg_stat_statements`, de que ninguém
> mais as chamava. Uma trava de mesa sobre o replay das migrations e um par no catálogo do CI tornam a forma velha
> impossível de voltar. A equivalência com as funções de verdade deu **1.004 células, 0 divergentes**, no ensaio e em
> produção; nenhum número de tela mudou. O caminho quente parou de pagar duas vezes: os KPIs numa ida, `/itens` em duas
> idas no lugar de sete, a memória por request com chave estável, teto obrigatório em `paginarTodos`, o índice do "último
> lançamento". **O que custou, e o que não veio:** o as-of ficou ~1,6× mais caro no consolidado (medido e declarado desde a
> `0143`), e nas três leituras de movimentações o recorte de uma filial ainda lê o que o consolidado lê — o plano escolhe o
> índice de data no volume de hoje.

---

# 1. O ROTEIRO DO JOHNNY — o que conferir, e o que ficou

*Nada aqui é pedido de autorização: a fase fechou inteira. É o que vale a pena olhar, e o que não se resolveu nela.*

### O canal caiu e voltou — o que isso custou

Na madrugada de 17/09 as ferramentas do conector da Supabase foram desligadas nas configurações do conector; a execução
seguiu a ordem (PR aberto sem merge, comandos no topo deste relatório — ata (j)). Reabilitado o conector no mesmo dia, a
fase retomou do ponto em que parou (atas (l) e (m)): nada foi refeito, e o CI foi rodado de novo sobre o HEAD antes do
merge. **Se acontecer de novo:** a memória `conector-supabase-desligado-no-meio-da-run` e a ata (j) têm o caminho.

### Conferir (5 minutos, só leitura)

1. <https://ti-wap-inventory-control.vercel.app/api/saude> → `"versao":"1.65.0"`; `/versoes` com a entrada nova.
2. `/itens` e `/relatorios/geral`: os números são os de antes — nesta fase nenhum número de tela mudou (a equivalência
   provou célula a célula; o smoke confere as formas).
3. `git diff v1.64.0 v1.65.0 --stat`: aparecem `supabase/migrations/0141`–`0145` e o lock, `src/lib/queries/**`,
   `src/lib/supabase/rpc.ts`, `src/lib/types/database.ts`, as 30 páginas de `(app)` (o `maxDuration`), `scripts/**`,
   `supabase/tests/**` e `docs/**`. **Não** aparecem migrations `0001`–`0140`, `CLAUDE.md` nem `.github/workflows/`.
4. `npm run test` uma vez, na sua máquina: 228 arquivos, 6.432 testes.

### O que ficou, com dono

- **O corte de scan nas três leituras de movimentações** (`rel_mov_por_mes_filiais`, `rel_por_motivo_filiais`,
  `rel_resumo_filiais`): no volume de hoje (3.578 movimentações) o plano genérico usa `movimentacoes_data_ordem_idx` e
  filtra a filial — uma filial em 365 dias lê os mesmos buffers do consolidado (§8). Não é regressão. Índice só por
  medição (R-REL-33): quem medir com volume maior decide.
- **O TTFB na faixa de horário da A/A.** As duas rodadas "depois" rodaram logo depois do `drop`, de manhã (UTC), e a A/A
  foi medida à tarde; a regra corrige pela deriva dos controles, e ela ficou dentro dos 18% (§8). Uma rodada extra na faixa
  19–21h UTC só mudaria algo se contrariasse a conclusão.
- **`SUPABASE_ACCESS_TOKEN` fora do ambiente** desde a F55: `npm run db:types` (CLI fixada) não tem canal; os tipos desta
  fase vieram do MCP `generate_typescript_types`, byte a byte iguais nos dois bancos. Nada a fazer enquanto o MCP existir.
- **O visualizador por senha** não teve tráfego na janela do `drop` (nenhuma senha ativa resolvida pelo harness, igual à
  F59): a ausência de chamador velho no `service_role` foi provada pelo código (o `git grep` vazio e a lista branca do
  visualizador), não pelo tráfego.
- **O backlog nomeado** (§14): F63, F65, F66, F67, F68 e as mutações do injetor para as formas da revisão final.

### Rollback — se precisar

A ordem inteira está no Anexo A do `RUNBOOK-BANCO.md` ("A ordem de rollback da fase"), no caso **3 — depois do `drop`**:
recriar as sete velhas com os corpos dos arquivos e os grants da `0056`, só então reverter o app (NUNCA `git revert` do
merge inteiro), e depois derrubar as novas, a view pela `0115` e o índice — sempre por migration nova, com `npm run
db:lock`.

---

# 2. O que mudou, por arquivo e por quê

183 arquivos entre `4c380ec` (`v1.64.0`) e `c516467`, mais os de documentação depois dele.

- **O banco** — `supabase/migrations/0141_rel_contagem_status.sql` (os KPIs numa ida), `0142_lanc_item_criado_por_idx.sql`
  (o índice, pela medição do ensaio), `0143_rel_filiais.sql` (as sete `_filiais` com os grants), `0144_colaboradores_textos_por_nome.sql`
  (a view pela chave de nome distinto), `0145_drop_rel_filial.sql` (o `drop` das sete velhas, arquivo separado); o lock.
- **A trava** — `scripts/db/recorte-rel.mjs` (replay, R1–R4, falha fechada; na revisão final, a cobertura por tabela e a
  dependência do recorte), `src/lib/validators/rpcs-recorte-sql.test.ts` (describes 1–7), o bloco 7 de
  `supabase/tests/catalogo_secdef.sql` (`7a`–`7g`, `k_excecoes_recorte`), `catalogos-seguranca.test.ts`; as mutações em
  `scripts/db/mutacoes.mjs` (oito novas, duas reancoradas) e o teto em `mutacoes.test.mts`.
- **Os roteiros** — os 59 pontos de 8 roteiros migrados para as `_filiais` (lista de rótulos idêntica antes × depois);
  `f60_recorte.sql` novo (NULL/`'{}'`, filial desativada, chamado que atravessa filiais); `asof_desempate.sql` 11a–11c.
- **A porta e os chamadores** — `src/lib/supabase/rpc.ts` (as sete fora de `ARGUMENTOS_ANULAVEIS`, os mapas de retorno),
  `src/lib/queries/relatorios/recorte-filiais.ts` (novo: `filiaisDoConsolidado`, `recorteDeFiliais` — onde o `null` morre),
  `relatorios/estoque.ts`, `relatorios/itens.ts`, `relatorios/movimentacoes.ts` (os estornos por `.in('estorno_de', ids)`),
  `queries/itens.ts` e `lib/itens/**` (os dois níveis de `/itens`), `queries/dashboard.ts` (novo: os KPIs pela `0141`),
  os descritores de forma e `fronteira-viewer.test.ts` (troca 1:1, catraca `≤ 7`), `scripts/smoke/**`, `scripts/formas/**`,
  `scripts/seed.ts`, `validar-truncamento.ts`.
- **O custo** — `paginarTodos`/`paginarPorIds` com `cap` obrigatório e keyset pela PK (`relatorios/comum.ts`);
  `src/lib/queries/memo-do-request.ts` (novo) e `auth/recorte-leitura.ts` (`chaveDasUnidades`); o teto das três tabelas
  (`lib/relatorios/teto-tabela.ts`, `components/relatorios/aviso-teto-tabela.tsx`); `maxDuration` nas 30 páginas.
- **A medição** — `scripts/perf/medir-rel.mjs`, `medir-custo.mjs`, `equivalencia-rel.mjs` (na revisão final, os modos
  `*-real`), `instrumentos-f60.test.mts`, `medir-itens.mjs` (as formas que o app emite); `docs/perf/f60-*.json` e
  `docs/perf/asof-orcamento.json` com a trava `src/lib/validators/asof-orcamento.test.ts`.
- **A versão e os documentos** — `package.json` `1.65.0`, `CHANGELOG.md`, `src/lib/versoes/registry.ts`; `PLAN-F60.md`,
  a emenda F60 da `MATRIZ-REGRAS.md`, o Anexo A e a receita da janela no `RUNBOOK-BANCO.md`, `ARQUITETURA.md`, o índice,
  a nota F60 da ficha em `PLANO-MULTIEMPRESA.md`, as atas F60 (duas de 16/09, as dez decisões e (a)–(k) de 17/09) e
  `docs/f60-evidencias/`.

---

# 3. Os números MEDIDOS, lado a lado com a ficha e a ordem

| o quê | a ficha / a ordem | medido | onde |
|---|---|---|---|
| primeira migration da fase | ficha: `0137` | **`0141`** (as `0137`–`0140` foram gastas pela F54→F56) | PLAN §1 |
| `NOT NULL` em `p_filiais` | ficha | **não existe** em parâmetro de função; "não-anulável" = conjunção direta + porta + trava | decisão 1 |
| `rel_*` vivas | "sete" | **oito** (a oitava, `rel_saldo_colaborador`, recorta por pessoa) → **nove** depois (as oito `_filiais` + a exceção) | decisão 9 |
| "10 chamadores" | ficha | **8** no app · **1** pela porta · **7** diretos em scripts · **59** chamadas em **8** roteiros · **2** mutações · mapas, descritores e listas | PLAN §1, fato 10 |
| "duas vezes por request" | ficha | só `contarConflitosAbertos`, com argumento-objeto que o `cache()` nunca acerta | decisão 6 |
| `paginarTodos` | "7 chamadores" | **48** + **5** de `paginarPorIds` | decisão 5 |
| visualizador sem teto | ficha | herda os **8 s** do `authenticator` | ata (f) |
| precedência do ajuste | ficha | `data desc, ordem desc` desde a F53 | R-REL-35 |
| a divergência de `/itens` | `itens/page.tsx:187-191` | em `lib/itens/lista.ts` e em **dois** pontos de `itens-table.tsx` | PLAN §1, fato 9 |
| `lanc_item_criado_por_idx` | provar em produção | **não se prova** com 155 lançamentos (0,31–0,33 ms); no ensaio, sem lançamento do autor: **2,19 ms / 258 buffers** com 10.035 linhas e **10,41 ms / 1.286** com 50.035 → entrou (`0142`) | ata (b) |
| `movimentacoes_ordem_lista_idx` | "morto?" | **vivo**: 28 formas / 5.931 chamadas (`authenticated`), 18 / 646 (`service_role`) → fica | ata (d) |
| agregado do PostgREST | `group by` direto | **desligado** nos dois bancos → RPC `0141` | decisão 6 |
| keyset | geral | RPC não compila pela porta; ordem composta sem cursor simples → keyset só pela PK (**33** + P2 + P6), OFFSET em **13 + 4** + 1 | decisão 5 |
| o "não-sargável" | ficha | confirma no caminho real (368 buffers para 5 ou 1.624 linhas); o `EXPLAIN` com literal não foi usado | PLAN §1, fato 6 |
| produção viva | ordem: 1.620 / 3.556 / 148 / 32 | **1.635** ativos · **3.578** movimentações · **155** lançamentos · **34** colaboradores · 6 filiais ativas | ata (i) (e) |
| células da equivalência | plano: 924 | **1.004** por banco, **0** divergentes, ensaio e produção — emulada antes do apply E com as funções de verdade depois | `f60-equivalencia-{emulada,real}.json` |
| as-of novo × velho | "mais barato" | **mais caro**: 1,58–1,82× no consolidado (+21–27 ms), 1,68–2,29× numa filial (+13–22 ms); para de crescer com o histórico | ata (a) |
| `/itens` por render | 1 + N | **1 + 6 = 7** → **2** idas | decisão 2 |
| KPIs | paginar `ativos` | 2 páginas (1.000 + 622 linhas, 1,50 + 2,11 ms) → **1** ida, **1,43 ms**; **1.622** nos três caminhos | decisão 6 |
| colaboradores | paginar a tela | chave por nome distinto: **~100 → ~50 ms**, **922** linhas, mesmo `md5` (emulado) | ata (c) |
| mutações ativas / teto | teto 85 | **90** ativas (82 + 8), **90/90** no CI, teto **95** | ata (g) |
| suíte | 219 / 5.997 | **228 / 6.432** (6.350 no fecho da execução; +82 na revisão final) | §11 |

**As catorze divergências que a ordem declarou** se confirmaram todas (`PLAN-F60.md` §1.1, ata (i)); as de cima são elas,
com o número. **As que a execução achou além** — (a) a (t) do censo e as onze depois do plano — estão na ata (i) e não se
repetem aqui; a revisão final acrescentou as da §10.

---

# 4. As dez decisões, com o custo que decidiu cada uma

A escolha inteira, com contexto e reversibilidade, está na ata "As dez decisões da fase" (17/09/2026). Aqui, o número.

1. **As assinaturas** — nome + `_filiais`, `p_filiais smallint[]`, `sql stable security invoker set search_path = public`,
   não `strict`, grants na mesma migration. *Decidiu:* o as-of da menor filial lia **368** buffers para **5** linhas; trocar
   o tipo no lugar derrubaria a `1.64.0` no ar.
2. **O consolidado** — lista explícita com desativada (`filiaisDoConsolidado`), o `null` morre em `recorteDeFiliais`;
   `/itens` em dois níveis. *Decidiu:* a soma das colunas não é o total quando um chamado atravessa filiais
   (`f60_recorte.sql` 3a: **0** × **5** atrelados, estoque **20** × **15**).
3. **O as-of** — lateral ancorada em `ativos`, estorno correlacionado, detentor uma vez por linha, sem pré-filtro, sem índice
   novo. *Decidiu:* é a única família que a R4 aceita; o `Incremental Sort` por ativo é ~**7–10%** do corpo.
4. **A janela do `drop`** — arquivos separados, T0 → tráfego → ≥ 30 min → T1, quatro condições. *Decidiu:* o
   `pg_stat_statements` separa por papel (`rel_saldo_itens` **8.406** chamadas de `authenticated`, **211** de `service_role`).
5. **`paginarTodos`** — `cap` obrigatório por domínio (≥ 20× o volume, piso 10.000), keyset pela PK. *Decidiu:* a guarda da
   chave não vê repetição na virada da página (**1.500 de 1.501** linhas).
6. **O caminho quente** — memória por request com chave primitiva; KPIs pela `0141`; `count` de `/ativos` `exact` (**1,34
   ms** sem busca, **7,73 ms** com); teto **2.000** nas três tabelas (~**13×** de folga); `maxDuration` 28 × 60 e 2 × 300;
   `statement_timeout` conferido, sem `alter role`.
7. **Os índices** — `lanc_item_criado_por_idx` entra (ensaio, linear); `movimentacoes_ordem_lista_idx` fica (consumidor
   identificado); o da lateral e `lanc_item_ordem_lista_idx` não entram.
8. **Colaboradores** — a chave por nome distinto antes do agregado: **~100 → ~50 ms**, mesmo conjunto.
9. **A trava** — mesa sobre o replay + par `7a`–`7g` no catálogo; a oitava como exceção permanente numa fonte só, e só com
   uma assinatura viva. *Decidiu:* proibir a substring `is null or` deixa passar `or p is null` e `coalesce(p, col) = col`.
10. **O orçamento do as-of** — sha256 do corpo vivo pelo replay + a medição; nunca calendário. *Decidiu:* um orçamento por
    data ficaria vermelho com o projeto parado; dentro da própria fase o corpo mudou uma vez (`497f7784…` → `54943d2f…`).

---

# 5. As sabotagens, com a saída real

| | O que se quebrou | O que acusou | Evidência |
|---|---|---|---|
| **A** | a trava contra a cadeia de ANTES do lote 2 | a mesa vermelha nomeando as **sete**; o par, só leitura, `7a` **7** · `7b` **7** · `7c`–`7g` **0**, universo **8**, igual no ensaio e em produção | `sabotagem-a-mesa-vermelha*.txt`, `sabotagem-a-par-catalogo-vermelho.txt` |
| **B** | as formas disfarçadas do fail-open, em memória | **20** reprovam pela regra nomeada, **7** passam | `sabotagem-b-disfarces.txt` |
| **C** | uma chamada de `paginarTodos` sem o teto | `TS2554: Expected 3 arguments, but got 2` | `sabotagem-c-cap.txt` |
| **D** | o orçamento do as-of sem o JSON / com um byte do corpo trocado | "ausente" (11 de 14) / "velho" (7 de 14); restaurado, 14 de 14 | `sabotagem-d-orcamento.txt` |
| **E** | as mutações do bloco 7 e dos cenários, no CI | **90/90** detectadas pelo rótulo nomeado (run 35173319638) | `sabotagem-e-ci-run1.txt` |
| **F** | os dois níveis de `/itens` desfeitos (consolidado = Σ colunas) | `expected 8 to be 12` | `sabotagem-f-itens-dois-niveis.txt` |
| **G** | o pré-filtro do as-of pela filial de HOJE | a mutação `f60-asof-pre-filtra-pela-filial-de-hoje` derrubada pelo **11a** no CI | `sabotagem-e-ci-run1.txt` |
| **H** | NULL e `'{}'` nas oito funções novas | **0** linhas em `f60_recorte.sql` 1a–1h (CI); e na equivalência emulada, nos dois bancos | `sabotagem-e-ci-run1.txt`, `f60-equivalencia-emulada.json` |
| **I** | a chave da memória por request como o objeto cru | **13 de 23** vermelhos (duas leituras por request); restaurada, 23 verdes | `sabotagem-i-cache.txt` |

**E a da revisão final:** a mesma bateria de 28 formas rodada com `recorte-rel.mjs` de `5094f6f` e com o do HEAD — **12**
formas de fail-open passavam e agora reprovam, as **16** legítimas seguem passando, e os harnesses dos revisores viram de
"PASSA" para "REPROVA" (`revisao-final-trava-antes-depois.txt`).

---

# 6. A equivalência

**EMULADA, antes de qualquer apply:** o corpo novo colado como subconsulta com literais tipados × a função velha do banco,
`count(*)` e `md5` das linhas com o mesmo tipo declarado, nas 12 datas de amostra × (consolidado com desativada + cada
filial por ordinal) × janelas 7d/365d nas de período, o saldo em três comparações, e os KPIs: **1.004 células por banco,
0 divergentes, no ensaio e em produção** (`docs/perf/f60-equivalencia-emulada.json`).

**Com a FUNÇÃO de verdade, entre o apply da `0143` e o da `0145`** (`docs/perf/f60-equivalencia-real.json`): cada bloco
conferiu, antes de medir, que a função nova aplicada tem o `md5` do `prosrc` versionado e que a velha ainda existe.

| função | células por banco | ensaio | produção | a velha com NULL (produção) |
|---|---:|---|---|---:|
| `rel_mov_por_mes_filiais` | 168 | 168 iguais | 168 iguais | 8 |
| `rel_por_motivo_filiais` | 168 | 168 iguais | 168 iguais | 11 |
| `rel_resumo_filiais` | 168 | 168 iguais | 168 iguais | 59 |
| `rel_mov_itens_filiais` | 168 | 168 iguais | 168 iguais | 23 |
| `rel_frescor_itens_filiais` | 84 | 84 iguais | 84 iguais | 2 |
| `rel_saldo_itens_filiais` | 156 | 156 iguais | 156 iguais | 23 |
| `rel_estoque_asof_filiais` | 84 | 84 iguais | 84 iguais | 1.624 |
| `rel_contagem_status_filiais` | 8 | 8 iguais | 8 iguais | — |
| **total** | **1.004** | **0 divergentes** | **0 divergentes** | |

NULL e `'{}'` → 0 linhas, sem erro, nas oito, nos dois bancos. Nenhuma filial desativada em nenhum dos dois (o caso da
desativada é provado pelo roteiro `f60_recorte.sql` no CI).

---

# 7. A janela do `drop`

Pela receita do `RUNBOOK-BANCO.md` (`docs/f60-evidencias/janela-do-drop.json`, `pos-deploy-e-drop.txt`):

1. **Pré-condição.** Merge `51b2886` às 11:23Z; `/api/saude` com `1.65.0`/`51b2886` às 11:25Z; smoke **109 OK · 0 falha**.
2. **T0** às 11:26:39Z (`pg_stat_statements` por papel, só chamadas e número de formas).
3. **Tráfego:** `medir.mjs` (19 rotas × 11, operador) e o smoke. **Prova estática do `service_role`:** o `git grep` das
   velhas em `src/**`/`scripts/**` vazio; `fronteira-viewer.test.ts` 18/18.
4. **T1** às 11:57:59Z — 31,35 minutos depois.
5. **As quatro condições:**

| | condição | resultado |
|---|---|---|
| (a) | Δ das VELHAS = 0 em `authenticated`, `service_role` e `anon` | as sete com Δ 0 nos dois papéis que tinham entrada; nenhuma em `anon` |
| (b) | Δ das NOVAS > 0 em `authenticated`; `service_role` só com a prova estática | +17 contagem · +54 as-of · +122 saldo · +27 mov_itens · +27 frescor · +1 mov_por_mes · +27 por_motivo · +28 resumo; `service_role` sem tráfego, prova estática verde |
| (c) | `dealloc` igual | 0 = 0 |
| (d) | `stats_reset` igual | igual |

6. **A `0144`** com a sonda idêntica antes e depois (923 linhas, `md5` `08374799…`, o resumo igual) e **a `0145`**: as sete
   velhas `null`, nove `rel_*` vivas com os grants, smoke outra vez **109 OK · 0 falha**, **paridade 11 de 11** e o bloco 7
   verde nos dois bancos.

No ensaio a `0144` e a `0145` foram na ordem da cadeia (lá não há app), com a mesma sonda (780 linhas, `md5` igual) e a
mesma prova de ausência.

---

# 8. O custo, antes × depois

| | antes (medido) | depois (medido) | fonte |
|---|---|---|---|
| KPIs do dashboard | 2 páginas: 1.000 + 622 linhas, 1,50 + 2,11 ms de banco | **1 ida, 1,36 ms** (chamada; corpo 1,67 ms), `Index Only Scan ativos_filial_status_idx`, 272 buffers | `f60-custo-real-producao.json` |
| `/itens` por render | 7 chamadas de saldo | 2 idas | decisão 2 |
| conflitos no shell | 2 leituras por request | 1 (sabotagem I) | decisão 6 |
| lista de nomes sem cadastro | ~100 ms | ~50 ms emulado; o conjunto idêntico depois do apply nos dois bancos | ata (c) |
| as-of consolidado, hoje (chamada) | 35,8 ms · 378 buffers | **55,9 ms** · 18.648 buffers — **mais caro, aceito** | `f60-producao-{antes,depois}-rel.json` |
| as-of filial menor, hoje (chamada) | 15,9 ms · 378 | 29,0 ms · 18.648 | idem |
| as-of, orçamento confirmado | 65,7 ms emulado | 54,8 ms com a função aplicada (razão 0,833) | §9 |
| `rel_mov_por_mes` UMA filial · 365d | 2,1 ms · 201 buffers | 2,1 ms · **201** buffers — o recorte não corta scan no volume de hoje | `f60-producao-depois-rel.json` |
| `rel_resumo` consolidado · 365d | 6,2 ms · 1.714 | 6,1 ms · 1.466 | idem |
| `rel_saldo_itens` consolidado | 2,1 ms · 23 linhas | 3,7 ms · 161 linhas (os dois níveis numa ida) | idem |
| `getUltimoLancamento`, sem lançamento (ensaio, 50.035) | 10,41 ms · 1.286 buffers | **0,017 ms · 3 buffers**, sem sort | `f60-itens-ensaio-depois.json` |

**O TTFB** (`f60-producao-depois-{1,2}.json` contra a A/A `f60-producao-antes-aa-{1,2}.json`, regra do `PLAN-F60.md` §3.7):
deriva do controle D = **1,079** (7,9%, ≤ 18% — vale): `/vercel.svg` 12,8 → 13,8 · `/login` 32,3 → 39,7 ·
`/relatorios/acesso` 57,3 → 61,8 ms. **As 16 rotas com sessão dentro da faixa (R ≤ 1,131), nenhuma fora** — de R 0,772
(`/itens`, 405,6 → 337,9 ms: as 7 idas viraram 2) a 0,963 (`/ativos/[id]`, 328,6 → 341,4 ms); `/` 369,1 → 334,8 (0,840),
`/itens/conferencia` 0,795, `/itens/historico` 0,822, `/admin/colaboradores` 0,896, `/relatorios/geral` 526,8 → 520,7
(0,916), `/relatorios/[filial]` 0,944. As rodadas foram às 12:02Z e 12:29Z, depois do `drop`; a A/A, às 19:47Z e 21:13Z do
dia anterior — a faixa de horário está declarada no §1 (`docs/f60-evidencias/ttfb-criterio-27.txt`).

---

# 9. O orçamento do as-of

`docs/perf/asof-orcamento.json`: `rel_estoque_asof_filiais(smallint[], date)`, sha256 da definição viva pelo replay
`78e967373c53…`, medição de produção sobre o corpo EMULADO — **65,722 ms** de mediana (p95 80,677), **18.638** buffers,
**1.624** linhas, os nós do plano. **A confirmação chamando a função** (produção, 17/09/2026, depois do apply da `0143`,
`md5` do `prosrc` conferido): corpo aplicado **54,758 ms** de mediana (p95 59,817), **18.638** buffers, **1.624** linhas,
`mov_ativo_idx`; a chamada pelo nome **57,826 ms** — gravada em `medicao.confirmacao`, razão **0,833** sobre a medida. O
hash não mudou, e `asof-orcamento.test.ts` segue 20/20. A trava reprova ausente, velho, incompleto, outra assinatura,
ilegível e sem corpo vivo; a mesma medição datada de 2000 passa.

---

# 10. A revisão adversarial final

Subagentes em contexto fresco contra a ordem, o plano e os 34 critérios; cada achado passou por um cético. **22 mantidos,
22 tratados** — a ata (k) tem a escolha e o motivo de cada um.

| # | Achado | Tratamento | Commit |
|---|---|---|---|
| 1, 3 | R3 olhava só o token vizinho: `x or y and col = any (p_filiais)` e `… and true or true` passavam; `$1` invisível | varredura até o limite da cláusula; `$n` reprova | `36b6486` |
| 2, 4 | ligação no `on` de LEFT/RIGHT/FULL JOIN cobria o lado preservado | cobertura por tabela, ciente do tipo de junção | `36b6486` |
| 5 | corpo com dois comandos: o R4 lia o primeiro, a função devolve o último | ilegível | `36b6486` |
| 6 | o corpo julgado era o primeiro `$…$` (um `default` isca) | o literal depois do `as` de nível zero | `36b6486` |
| 7 | DDL dinâmico em corpo entre aspas/E-string escapava | falha fechada também ali | `36b6486` |
| 8 | a chave do replay com a grafia crua do tipo; `drop` sem lista | tipo canônico; nome único | `36b6486` |
| 9 | junção decorativa (`cross join filiais`) cobria as outras tabelas | propagação só por igualdade de chave | `36b6486` |
| 10 | função no FROM, `(table x)`, alias sombreado | ilegível / leitura / herança por chave | `36b6486` |
| 11 | `rename to U&"…"` passava em silêncio | falha fechada | `36b6486` |
| 12, 16 | sem comando para a equivalência real, o "depois" do B1 e a confirmação do orçamento | modos `*-real` (e `--real` sem engolir a opção seguinte) | `e8befbe`, `74ec025`, `c516467` |
| 13 | a migration de reversão reprova guardas que o runbook não citava | listadas no Anexo A | docs |
| 14, 21 | o §11 do plano mandava `git revert` do merge | corrigido; escopo do commit misto | docs |
| 15 | Δ = 0 em `service_role` aceito por falta de tráfego | prova estática | docs |
| 17 | "o caminho da `0131`" não é script | o runbook diz o que é | docs |
| 18 | este relatório não existia | criado | docs |
| 19 | `5094f6f` sem ata, e três documentos o desmentindo | ata (k); matriz e runbook | docs |
| 20 | SHA não gravado; o CI citado não cobre o HEAD | `c516467` gravado; CI sobre ele é o passo 1.0 | docs |
| 22 | o registry generalizava 1,6–1,7× | as duas faixas medidas | `754d1d4` |

**Não feito, declarado:** mutação nova no injetor para as formas dos achados 1–11 (exige banco descartável; a regressão
fica no describe 7, que roda em `npm run test`). O push, o CI sobre o código congelado e o corpo do PR foram feitos no fim
da execução (run 35186554796).

---

# 11. Os 34 critérios, autoverificados

| # | Critério | Estado | Onde |
|---|---|---|---|
| 1 | lint, test, build, tsc, `verificar:actions` | ✅ | `c516467`: 228 / 6.432; CI verde em `3f10f2e` e em `5bbc0ca` (run 35215000369), antes do merge |
| 2 | o `PLAN-F60.md` com censo, tabelas, linhas de base, datas | ✅ | PLAN §1–§3, antes dos lotes (§12) |
| 3 | sete novas com `= any (p_filiais)`, NULL e `'{}'` → 0 em roteiro | ✅ CI e nos dois bancos | `f60_recorte.sql` 1a–1h; verificação pós-apply |
| 4 | grants nos dois bancos, 6a verde | ✅ | verificação pós-apply nos dois; bloco 7 só leitura verde nos dois; paridade `grant_func` |
| 5 | as-of lateral, `asof_desempate.sql`, transferido depois da data | ✅ CI | 11a–11c, R-REL-35 |
| 6 | equivalência igual no ensaio e em produção | ✅ EMULADA e REAL: 1.004 × 2, 0 divergentes | §6, `f60-equivalencia-real.json` |
| 7 | consolidado com desativada; nenhum número muda | ✅ roteiro + equivalência real | decisão 2 |
| 8 | `/itens` colunas + consolidado; `estoqueForaDasColunas` | ✅ (numa LEITURA paginada: 2 idas — divergência declarada) | sabotagem F; smoke pós-deploy |
| 9 | chamadores migrados, travas verdes | ✅ | `grep-p_filial-pos-lote2.txt`; o `git grep` da janela vazio |
| 10 | 59 chamadas em 8 roteiros; 2 mutações reancoradas | ✅ | `rotulos-roteiros.txt`, CI 90/90 |
| 11 | `rpcs-recorte-sql.test.ts`: coleta, replay, falha fechada, vermelho gravado | ✅ (reforçado na revisão final) | sabotagens A e B, describe 7 |
| 12 | par no catálogo verde, mutações pelo rótulo, teto | ✅ CI e nos dois bancos (bloco 7 só leitura, universo 9) | `ci-sha-congelado.txt`, `pos-deploy-e-drop.txt` §7 |
| 13 | `rel_saldo_colaborador` decidida, uma fonte, dois sentidos | ✅ | R-ACC-76 |
| 14 | `paginarTodos` sem `cap` não compila; keyset/OFFSET listados | ✅ | sabotagem C, decisão 5 |
| 15 | as sete velhas dropadas | ✅ ensaio e produção, depois da janela | §7, `janela-do-drop.json` |
| 16 | `cache()` com chave primitiva, UMA leitura | ✅ | sabotagem I |
| 17 | KPIs sem ler `ativos` inteira, oito números iguais | ✅ teste + equivalência real (8 células × 2) + plano "depois" (1,36 ms) | decisão 6, §8 |
| 18 | `count` de `/ativos` decidido com custo | ✅ | ata (e) |
| 19 | teto e aviso nas três tabelas; snapshot sem `meta.schema` novo | ✅ | decisão 6 |
| 20 | `maxDuration` e o import | ✅ | `maxduration.md` |
| 21 | `statement_timeout` conferido, sem `alter role` | ✅ | ata (f) |
| 22 | `medir-itens.mjs` na forma do app, no ensaio, limpeza por contagem | ✅ antes e depois | ata (b), `f60-itens-ensaio-depois.json` |
| 23 | `lanc_item_criado_por_idx` e `movimentacoes_ordem_lista_idx` decididos | ✅ | atas (b), (d); o "depois" do ensaio |
| 24 | `buscarEstornosAteData` com `.in('estorno_de', ids)` | ✅ | `relatorios/movimentacoes.ts` |
| 25 | `/admin/colaboradores` decidido e medido | ✅ emulado · sonda real idêntica nos dois bancos | ata (c), `pos-deploy-e-drop.txt` §4 |
| 26 | `asof-orcamento.json` com o hash; trava sem calendário | ✅ e confirmado chamando a função (razão 0,833) | sabotagem D, §9 |
| 27 | TTFB "depois" dentro da faixa A/A | ✅ D 1,079 (7,9%); 16 de 16 rotas com R ≤ 1,131 (0,772–0,963); faixa de horário declarada | §8 |
| 28 | lock e `migrations-f38.test.ts`; `database.ts` regenerado; deriva verde; `0001`–`0140` intocadas | ✅ — os tipos de produção iguais byte a byte ao hand-fix sem os comentários | Anexo A, `pos-deploy-e-drop.txt` §8 |
| 29 | emenda F60, Anexo A, receita, ata | ✅ | matriz, runbook, atas (a)–(m) |
| 30 | `1.65.0`, CHANGELOG, registry; tag | ✅ — a tag anotada `v1.65.0` no merge do PR de documentação | ata (m) |
| 31 | `RELATORIO-F60.md` com o roteiro no topo | ✅ | este |
| 32 | os dois PRs mergeados | ✅ o de código (#52); o de documentação, com o CI verde | ata (m) |
| 33 | nenhum dado real em teste, evidência, log | ✅ | a varredura de `f60-evidencias/README.md`; a das evidências de banco real (UUID, e-mail, patrimônio: 0) |
| 34 | o estado de repouso declarado | ✅ | §12 |

---

# 12. O estado de repouso — se o projeto parar aqui por dois meses

- **Produção, ensaio e `main` na `1.65.0`**, com as oito `_filiais` e a exceção `rel_saldo_colaborador`, e nenhuma das
  sete velhas. A paridade de schema bate nas 11 classes. Nada da fase fica "pela metade".
- **O que envelhece:** o custo do as-of cresce com o NÚMERO DE ATIVOS (a lateral visita cada um), não com o histórico; o
  orçamento não envelhece pelo calendário — só se o corpo mudar. As três leituras de movimentações seguem lendo, por
  filial, o que o consolidado lê: com mais movimentações isso cresce, e é lá que um índice pela filial pode passar a valer
  (medir antes). O TTFB "antes" e "depois" envelhecem com o volume.
- **O que acende sozinho se alguém voltar a forma velha:** a trava de mesa (`rpcs-recorte-sql.test.ts`) e o bloco 7 do
  catálogo no CI; o orçamento do as-of se o corpo mudar sem medição nova.

---

# 13. O que este relatório NÃO prova

- **Que a equivalência vale para toda data** — vale para as 12 de amostra, sobre o dado de 16/09 (emulada) e de 17/09
  (real), no consolidado e em cada filial.
- **Que a trava julga se a lista passada é a certa** — ela julga a FORMA do recorte; `rel_resumo_filiais(array[<filial
  errada>], …)` passa em todas as regras (isso é a F63). E uma coluna CALCULADA chamada `filial_id` numa lateral é aceita
  pela forma, não pela semântica.
- **Que o recorte obrigatório corta scan hoje** nas leituras de movimentações — o `explain` "depois" mostra que não, no
  volume atual (§8).
- **Que o TTFB vale para outro volume, ou para a faixa de horário da A/A** — as rodadas "depois" rodaram de manhã (UTC).
- **Que o índice medido com volume fictício no ensaio se comporta igual em produção** quando o volume chegar — em produção
  ele só apareceu como usado (fora de `unused_index`).
- **Que nenhuma aba aberta antes do deploy viu erro na janela do `drop`** — o `pg_stat_statements` não registrou chamada
  velha em 31 minutos de janela, e isso é o que se pode provar.
- **Que o visualizador por senha não chama as velhas por TRÁFEGO** — só pelo código (a prova estática da receita).
- **Que o consolidado de quem entra pela senha é recortado por inquilino** — é "tudo" porque o `service_role` não tem RLS;
  isso é da F68.
- **Que as mutações do injetor cobrem as formas da revisão final** — a regressão delas é da mesa (describe 7).

---

# 14. Pendências e backlog nomeado

**Pendências desta fase:** nenhuma. O que não se resolveu na fase — o corte de scan nas leituras de movimentações e a faixa de horário do TTFB — está no §1 e no backlog abaixo.

**Backlog nomeado:**
- **O corte de scan nas três leituras de movimentações** — medir `mov_filial_data_idx` × `movimentacoes_data_ordem_idx`
  no plano genérico com `= any ($1)` quando o volume crescer; índice só pela medição.
- **F63** — a camada de relatório segue `number | null` por dentro (o `null` morre em `recorteDeFiliais`); `empresa_id`
  nas leituras.
- **F65** — `(empresa_id, ordem)` e o cursor do keyset; as ordens compostas que ficaram em OFFSET (**13 + 4 + 1**, cada uma
  com o motivo na chamada — [C] composta sem cursor simples, [T] lista de tela, [R] fonte RPC, [V] unicidade só de
  construção) e a troca `created_at desc, id desc` → `ordem desc`, que muda a ordem visível no empate (as "duas réguas" da
  F53).
- **F66** — re-rodar `medir-rls.mjs`, `medir.mjs` e o orçamento do as-of imediatamente antes.
- **F67** — `v_conflitos_filiais` pelo mesmo mecanismo da view de colaboradores; o `ALCANCE_DO_RESET` (o nulo = global da
  Zona destrutiva).
- **F68** — o visualizador sem `service_role`, e o teto dele.
- **Os índices não criados, com a medição:** o da lateral do as-of `(ativo_id, data desc, ordem desc)` — o sort por ativo é
  ~7–10% do corpo; `lanc_item_ordem_lista_idx` — os 708 ms que o justificariam vinham do `SELECT` sem `WHERE` do harness
  antigo.
- **A trava:** mutações no injetor para as formas da revisão final (precedência do `or`, junção externa, dois comandos),
  na próxima fase que tocar `scripts/db/mutacoes.mjs` com banco descartável.
- **Os scripts que leem `rel_saldo_itens_filiais` numa ida** (`smoke-prod.mjs`, `fixtures-passe2.ts`, `seed.ts`) têm o
  limite de `max-rows`, latente em centenas de itens, e falham ALTO (R-REL-36).
