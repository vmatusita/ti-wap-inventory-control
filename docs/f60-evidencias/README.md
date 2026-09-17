# Evidências da F60 — o recorte que corta scan, e o custo do caminho quente

As saídas reais das sabotagens e das provas da fase, copiadas da pasta de trabalho da execução (fora do repositório) em
17/09/2026. Leia-as junto com a emenda F60 da [`MATRIZ-REGRAS.md`](../MATRIZ-REGRAS.md) (R-ACC-73 a R-ACC-76 e R-REL-34 a R-REL-46) e com as
atas F60 de [`DECISOES.md`](../DECISOES.md) — nunca no lugar delas.

⚠ **Nenhuma das migrations da fase (`0141`–`0145`) foi aplicada em banco real** (ata F60 (j), 17/09/2026). Tudo aqui é
prova de mesa, de CI ou consulta de catálogo só leitura. **O que NÃO está aqui, porque depende do apply:** as
verificações pós-apply, a equivalência com as funções de verdade, o `conferir.mts` sobre os descritores novos, o
`explain` "depois", a confirmação do orçamento do as-of, a sonda de conjunto da `0144`, o "depois" do harness de itens, a
janela do `drop` (T0/T1 do `pg_stat_statements`), o TTFB "depois" e o smoke pós-deploy. As medições da fase em JSON — as
linhas de base de produção, a equivalência EMULADA (1.004 células por banco), o custo dos corpos novos, o harness de itens
e o orçamento vivo do as-of — estão em [`../perf/`](../perf/) (`f60-*.json` e `asof-orcamento.json`).

## O que foi mascarado

Antes de copiar, cada arquivo foi varrido por UUID (`[0-9a-f]{8}-[0-9a-f]{4}-`), e-mail, patrimônio (`WAP\d`) e caminho
absoluto com o nome de usuário do Windows:

- **caminhos absolutos** — o do repositório virou `<repo>` (no cabeçalho `RUN` do Vitest, em 6 arquivos) e o da pasta de
  trabalho, que carrega o usuário do Windows e o id da sessão, virou `<scratchpad>` (`rotulos-roteiros.txt`; em
  `sabotagem-d-orcamento.txt` ele já vinha assim da origem); as menções
  relativas `scratchpad/…` de `maxduration.md` e `bloco7-verde-por-leitura.txt` viraram `<scratchpad>/…`. O único UUID
  encontrado era o id da sessão dentro desse caminho — saiu com ele;
- **nenhum e-mail e nenhum patrimônio** apareceu. Os ativos `ZZF…` dos roteiros em `sabotagem-e-ci-run1.txt` são as
  fixtures fictícias do CI; as linhas com UUID do log do CI já tinham sido removidas na origem (o cabeçalho do arquivo diz);
- **nenhum texto de statement de produção**: a leitura de catálogo (`sabotagem-a-par-catalogo-vermelho.txt`) devolve só
  contagens e nomes de função, e os dois `.sql` são as consultas que ESTA fase escreveu. Os refs dos projetos de ensaio e de
  produção ficaram — já estão na topologia do [`RUNBOOK-BANCO.md`](../RUNBOOK-BANCO.md).

Fora os caminhos, nenhum byte mudou (o número de linhas de cada arquivo é o da origem).

## A trava do recorte — nasce vermelha, e cada disfarce reprova

| Arquivo | O que prova | Regra · critério |
|---|---|---|
| `sabotagem-a-mesa-vermelha.txt` | **Sabotagem A na mesa:** `npx vitest run` integral contra a cadeia de antes do lote 2 — o describe 3 de `rpcs-recorte-sql.test.ts` vermelho nomeando as SETE `rel_*` velhas (R1), e só ele (1 de 6.057) | R-ACC-74 |
| `sabotagem-a-mesa-vermelha-pos-lote1.txt` | A mesma, de novo, com o lote 1 no disco (`1e604e3` + `0142`): a trava continua vermelha pelas mesmas sete | R-ACC-74 |
| `sabotagem-a-par-catalogo-vermelho.txt` | **Sabotagem A no par:** as contagens do bloco 7 isoladas num bloco só leitura, no ensaio E em produção, antes do lote 2 — `7a` 7 · `7b` 7 · `7c`–`7g` 0 · universo 8, idêntico nos dois | R-ACC-75 |
| `bloco7-mcp.sql` | O bloco só leitura que produziu o arquivo acima (`transaction_read_only`, termina em `raise exception`) | R-ACC-75 |
| `bloco7-somente-leitura.sql` | O mesmo bloco, regravado depois da revisão adversarial da trava (a `7g` e o fallback por `proargtypes` de `7a`/`7f`) | R-ACC-75 · R-ACC-76 |
| `bloco7-verde-por-leitura.txt` | Antes do CI, por LEITURA (sem banco): com a cadeia `0001`→`0145`, `7a`–`7g` verdes sobre as nove vivas, com a ressalva escrita de que só o `banco-sem-docker` confirma | R-ACC-75 |
| `sabotagem-b-disfarces.txt` | **Sabotagem B:** o describe 5 (SQL sintético em memória) — 20 formas reprovam pela regra nomeada, 7 passam (27 verdes; os outros describes pulados) | R-ACC-74 |
| `sabotagem-e-ci-run1.txt` | **Sabotagem E no CI:** trechos do run 35173319638 (`f7b3153`) — o gate de deriva, os roteiros da fase (`11a`–`11c`, `7a`–`7g`, `1a`–`1h`) e o injetor com as oito mutações novas e as duas reancoradas detectadas pelo rótulo nomeado (90/90) | R-ACC-75 · R-REL-34/35 |
| `revisao-lote2-recorte-rel-routine.txt` | O achado da revisão do lote 2: `drop routine` de uma `rel_*` a deixava viva no replay, e a mesa seguia verde | R-ACC-74 |
| `sabotagem-trava-routine.txt` | O conserto de 17/09 (`routine` lido como `function`) e a sabotagem em três cortes: o conserto inteiro desfeito (7 de 61 vermelhos), só o replay (6), só a auto-conferência (2); a cadeia real idêntica antes e depois | R-ACC-74 |

## O motor — o que muda por dentro sem mudar número

| Arquivo | O que prova | Regra · critério |
|---|---|---|
| `sabotagem-f-itens-dois-niveis.txt` | **Sabotagem F:** desfazer os dois níveis de `/itens` (consolidado = Σ colunas) → `expected 8 to be 12` | R-REL-36 |
| `sabotagem-revisao-lote2-saldo-uma-ida.txt` | A leitura do saldo em dois níveis voltando a UMA ida: 5 de 15 vermelhos em `relatorios/itens.test.ts` — o `max-rows` corta a coluna da última filial e a trava da porta única acusa | R-REL-36 |
| `sabotagem-rpc-mapas-evidencia-falsa.txt` | Uma letra trocada na evidência de `rpc.ts` (`rel_estoque_asof_filiais.colaborador` e `rel_saldo_itens_filiais.filial_id`) → os dois vermelhos em `rpc-mapas-sql.test.ts`; restaurado, 22 verdes | R-REL-35/36 |
| `sabotagem-revisao-lote2-guarda-drop.txt` | A guarda de intocáveis de `migrations-f38.test.ts` com as regex antigas: 11 de 26 vermelhos (nome citado, `drop routine`, grafia distinta, o que não sabe ler) | R-ACC-73 |
| `rotulos-roteiros.txt` | As 59 chamadas dos 8 roteiros migradas para as `_filiais`: 0 velhas depois, e a lista ORDENADA de rótulos idêntica antes × depois em cada arquivo; e os rótulos novos — `11a`–`11c` sem colidir com token existente, e os de `f60_recorte.sql` conferidos pela régua de leitura por TOKEN do injetor | R-ACC-73 · R-REL-35 |
| `grep-p_filial-pos-lote2.txt` | `git grep p_filial` depois do lote 2 (`778eacb`): o que sobra é a Zona destrutiva, a cadeia do import e usos intencionais | R-ACC-73 |
| `equivalencia-rel-diff-versionado.txt` | O gerador da equivalência que rodou fora do repositório × o versionado em `scripts/perf/equivalencia-rel.mjs`: as diferenças não mudam o SQL emitido | a equivalência EMULADA |
| `medir-rel-antes-reproduzivel.txt` | `medir-rel.mjs` do lote 2 ainda gera o conjunto "antes" byte a byte (`diff` de 0 linha) e aceita o conjunto "depois" | a medição "antes" × "depois" |

## O custo

| Arquivo | O que prova | Regra · critério |
|---|---|---|
| `sabotagem-c-cap.txt` | **Sabotagem C:** uma chamada de `paginarTodos` sem o teto → `TS2554: Expected 3 arguments, but got 2` (`tsc` sai 2); apagada, sai 0 | R-REL-39 |
| `sabotagem-i-cache.txt` | **Sabotagem I:** a chave da memória por request como o objeto cru → 13 de 23 vermelhos (duas leituras no mesmo request, nos quatro cargos); restaurada, 23 verdes | R-REL-41 |
| `sabotagem-d-orcamento.txt` | **Sabotagem D**, num espelho fora do repositório: sem `asof-orcamento.json` → vermelho "ausente" (11 de 14); um byte do corpo do as-of trocado → vermelho "velho" (7 de 14); restaurado → 14 de 14 | R-REL-46 |
| `maxduration.md` | O censo por página do grupo `(app)`: 30 páginas, 28 × 60 e 2 × 300 (`admin/importar`, `dev/destrutivo`), com o motivo de cada uma | R-REL-43 |

## Os fechamentos de lote

| Arquivo | O que prova |
|---|---|
| `lote1-build.txt` | `npm run build` do lote 1 corrigido (`1e604e3`), saída 0 |
| `lote2-build.txt` | `npm run build` do lote 2, saída 0 |
| `lote2-build-final.txt` | Depois da revisão do lote 2 (`2020641`): `vitest` inteiro (228 arquivos, 6.343 testes), `lint`, `tsc`, `verificar:actions` antes e depois do build, e `build` — todos com saída 0 |
