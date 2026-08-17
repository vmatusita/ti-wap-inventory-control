# Plano — correção do truncamento de 1.000 linhas nas leituras do Supabase

> Entrega **avulsa fora de fase** · versão **1.40.2** (patch, regra 8 do `CLAUDE.md`)
> Branch: `fix/truncamento-as-of-1000` · 17/08/2026

---

## 1. Causa raiz

A API de dados do Supabase (PostgREST) corta **qualquer** resposta em **1.000 linhas**
(`max-rows`, teto da configuração atual do projeto). Quem lê uma coleção que pode passar
disso e **não pagina** recebe 1.000 linhas e nenhum sinal de erro — o corte é silencioso.

O acervo passou de 1.000 ativos durante os imports de go-live (20–31/07/2026). Desde então,
todo ponto de leitura não paginado que abrange o acervo inteiro devolve número errado.

O repositório **já tinha** o remédio — `paginarTodos` em
[`src/lib/queries/relatorios/comum.ts:42`](../src/lib/queries/relatorios/comum.ts) —
mas ele não estava aplicado em todos os pontos.

### O bug principal

[`src/lib/queries/relatorios/estoque.ts:86`](../src/lib/queries/relatorios/estoque.ts) —
`lerEstadoAtivos` tem dois caminhos:

| caminho | condição | como lê | resultado |
|---|---|---|---|
| fast path | `ate >= hoje` | `paginarTodos` sobre `ativos` | **certo** (1.647) |
| as-of | `ate < hoje` | `client.rpc('rel_estoque_asof')` **sem paginação** | **1.000** (truncado) |

A função SQL está **correta** — provado em produção: a mesma RPC com `offset=1000` devolve
as 648 linhas restantes. O defeito é só do lado do app.

### Consequências medidas em produção (17/08/2026)

```
ativos total: 1651 | fora de baixa: 1647
rel_estoque_asof 15/08 consolidado SEM paginacao: 1000
  ... com .range(1000,1999): 648 => total real: 1648
```

1. **Δ fantasma no relatório ao vivo.** Período terminando hoje: `kpis` sai do fast path
   (1.647, real) e `kpisAnterior` sai da RPC truncada (1.000) → o comparativo anuncia
   **+647 ativos** que nunca entraram.
2. **Snapshot congelado errado.** O consolidado 03–07/08 (gerado 11/08) congelou
   `kpis.total = 1000` **e** `kpisAnterior.total = 1000`. Os números reais são **1.648** e
   **1.641**. A semana inteira está congelada errada.
3. **Série "Evolução do estoque"** — cada ponto passado é uma reconstrução as-of: todos
   truncados.
4. **Tudo que deriva do estado as-of** (categoria × status, disponíveis por modelo,
   reservados, manutenção) erra quando o escopo passa de 1.000 — vale para o consolidado
   **e** para a Matriz sozinha (1.169 ativos as-of 15/08).

### Achado próprio desta análise: paginar sem ordem total é outro bug

`rel_estoque_asof` **não tem `ORDER BY`** no `select` final
(`supabase/migrations/0109_devolucao_direta_e_re_reserva.sql:299`). Paginar com `.range()`
sobre uma relação sem ordem total é incorreto por construção: o Postgres não garante a
mesma ordem entre duas consultas independentes (o plano pode mudar — *seq scan* × *index
scan*, workers paralelos), e páginas podem repetir e perder linhas.

Medido hoje em produção, as duas passadas concordam (1.648 distintos, zero duplicatas, com
e sem `order`) — mas isso é **propriedade do plano atual, não garantia**. A correção impõe
`.order('ativo_id')` na chamada da RPC: `ativo_id` é `uuid` e há uma linha por ativo, então
é ordem **total**. Custo nulo, correção por construção.

> `supabase/` está **fora de escopo** (a função SQL está certa). A ordem é imposta pelo
> PostgREST na chamada, não por migration.

---

## 2. Varredura mesma-raiz — vereditos

217 pontos de leitura Supabase enumerados em `src/` e `scripts/` (`.rpc(`, `.select(`,
`.in(`): **175 seguros estruturalmente**, **30 já paginados**, **12 a tratar**.

A tabela completa, ponto a ponto, vai no relatório final. Aqui, só o que **muda**:

### 2.1 A corrigir (paginação)

| # | ponto | tabela/RPC | por quê |
|---|---|---|---|
| 1 | `queries/relatorios/estoque.ts:86` `lerEstadoAtivos` (as-of) | rpc `rel_estoque_asof` | **o bug principal** — uma linha por ativo (1.647 hoje) |
| 2 | `queries/relatorios/estoque.ts:347` `manutencaoDeEstado` (retQ) | `movimentacoes` | filtro só por tipo + período, que pode ser o preset "Tudo" (plurianual) |
| 3 | `queries/relatorios/estoque.ts:371` `manutencaoDeEstado` (devQ) | `movimentacoes` | idem, outro tipo |
| 4 | `queries/relatorios/estoque.ts:400` `manutencaoDeEstado` (enviosRaw) | `movimentacoes` | `.in(ids)` sem paginação; `ids` **perde o teto acidental** quando 2 e 3 forem paginados |
| 5 | `queries/relatorios/estoque.ts:407` `manutencaoDeEstado` (anotacoesRaw) | `anotacoes` | idem 4 |
| 6 | `queries/relatorios/estoque.ts:267` `dadosAtivos` | `ativos` | `.in(ids)` — mesmo efeito dominó de 4/5; lista grande também estoura a URL |
| 7 | `queries/relatorios/estoque.ts:286` `chamadoAteData` | `movimentacoes` | já usa `paginarTodos`, mas o `.in(ids)` continua sem lotes |
| 8 | `queries/relatorios/itens.ts:97` `getGruposItens` (obsRows) | `lancamentos_item` | usa `.limit(1000)` **fixo** — o comentário do arquivo afirma `paginarTodos`, mas não é |
| 9 | `queries/dev-destrutivo.ts:276` `listarItensDestrutivo` | `lancamentos_item` | `select` **sem filtro nenhum**; o comentário fala do catálogo (`itens`, pequeno), mas lê a tabela de evento |
| 10 | `queries/movimentacoes.ts:93` `listarMovimentacoesDoAtivo` | `movimentacoes` | linha do tempo da ficha, sem teto nenhum; um corte aqui esconderia história do ativo sem avisar |
| 11 | `queries/conflitos.ts:489` `ladosDosAtivos` | `v_conflitos_filiais` | `.in(ids)` sem teto; o limite de 200 existe só no *outro* call site (`apagarConflito`), não no preview |
| 12 | `scripts/import/carga.ts:463` `executarItens` | `lancamentos_item` | teto depende de uma convenção de texto (`OBS_SALDO_INICIAL`), não de restrição estrutural |

### 2.2 Investigados e **não** corrigidos (com motivo)

- **`actions/importar.ts:403` `aplicarImport`** — é payload de **escrita** (RPC
  `importar_ativos_substituir`), não leitura truncada. `max-rows` não se aplica. Fora da
  causa raiz desta entrega; registrado como observação no relatório.
- **`actions/exportar.ts:504` `exportarItensSaldosCSV`** — delega a
  `getSaldosPorFilial`/`getSaldosItensDeFiliais`, que agregam **por item do catálogo**
  (`group by i.id`), domínio pequeno e curado. As RPCs `rel_saldo_itens`/`rel_mov_itens`
  são agregadas por item e `rel_frescor_itens` por grupo (enum de 2 valores). Seguro
  estruturalmente.

---

## 3. O que será feito

### 3.1 Núcleo — `src/lib/queries/relatorios/comum.ts`

- **`paginarTodos` não muda de assinatura.** O *builder* de RPC do supabase-js aceita
  `.range(from,to)` e resolve para `{ data, error }` — a mesma forma que o callback já
  espera. Serve como drop-in; o que falta é **documentar a exigência de ordem total**.
- **Novo `paginarPorIds`** — para as leituras `.in('col', ids)`: quebra a lista de ids em
  lotes e concatena. Resolve os **dois** limites de uma vez (o `max-rows` por lote e o
  tamanho da URL, que uma lista de milhares de uuids estoura antes mesmo do corte de
  linhas). Lote de 100 ids ≈ 3,7 KB de query string — folga confortável.

### 3.2 Testes novos (`src/lib/queries/relatorios/comum.test.ts`)

Hoje `paginarTodos` **não tem teste** (confirmado: não existe `comum.test.ts`). O repo
testa só funções puras e **não tem** convenção de mock de builder encadeado — então o teste
novo mocka apenas o **callback** `(from,to) => {data,error}`, que é função pura de página.
Casos:

1. conjunto menor que uma página → uma chamada só;
2. conjunto de exatamente 1.000 → **duas** chamadas (a segunda vazia) — o caso que prova
   que "veio página cheia" nunca é confundido com "acabou";
3. 1.648 linhas em 2 páginas → concatena na ordem, sem repetir;
4. `error` na 2ª página → lança com o rótulo;
5. `paginarPorIds`: 250 ids → 3 lotes; lista vazia → nenhuma chamada; concatenação preserva
   a ordem dos lotes.

### 3.3 Script de validação — `scripts/manutencao/validar-truncamento.ts`

**Só leitura**, contra produção, imprime **só contagens** (regra 2 — nenhum patrimônio,
nome ou linha real). Compara, para cada caso, o `lerEstadoAtivos` corrigido com a contagem
paginada bruta:

- consolidado as-of **hoje** (fast path) — deve bater com `count exact` de `ativos`;
- consolidado as-of **15/08** (passado) — esperado ≈ **1.648**;
- Matriz as-of **15/08** (passado, filial sozinha) — esperado **> 1.000**;
- e acusa **falha** se qualquer leitura devolver exatamente 1.000 (assinatura do corte).

Mede também, para dar veredito baseado em evidência e não em suposição: maior histórico de
movimentações por ativo, nº de reservados e tamanho do conjunto `ids` da manutenção.

### 3.4 Errata dos snapshots congelados

**Regra de elegibilidade** (confirmada contra `import_logs` em produção): o último import
"Substituir tudo" foi em **31/07/2026 18:32Z**. Os imports de go-live **apagaram e
recriaram** o acervo — reconstruir as-of anterior a isso produz número enganoso, pior que o
erro atual. Só gera v2 se **todas** as datas que o motor reconstruirá — `periodo_ate` **e**
o `ate` da janela anterior (`periodoAnterior`) — forem **posteriores a 31/07/2026**.

Inventário dos 11 snapshots (leitura de produção):

| snapshot | período | escopo | v | `kpis.total` | `kpisAnterior.total` | datas reconstruídas | veredito |
|---|---|---|---|---|---|---|---|
| `fa253a8f` | 03–07/08 | consolidado | 1 | **1000** | **1000** | 07/08 e 02/08 | **ERRATÁVEL** |
| `5b91ce25` | 13–17/07 | consolidado | 1 | 1556 | **1000** | 17/07 e 12/07 | não-erratável |
| `a6d57774` | 13–17/07 | consolidado | 2 | 1556 | **1000** | 17/07 e 12/07 | não-erratável |
| `adbab812` | 15–16/07 | consolidado | 1 | 1556 | **1000** | 16/07 e 14/07 | não-erratável |
| `2422fdd9` | 20–24/07 | consolidado | 1 | 1571 | **1000** | 24/07 e 19/07 | não-erratável |
| `8b3070d4` | 20–24/07 | consolidado | 2 | 1572 | **1000** | 24/07 e 19/07 | não-erratável |
| demais 5 | jun–jul | Matriz | — | — | — | anteriores a 31/07 | fora da regra |

Só **`fa253a8f`** qualifica: `periodoAnterior(03–07/08)` = 29/07–**02/08**, e as duas datas
que o motor reconstrói (07/08 e 02/08) são posteriores a 31/07. Valores corretos medidos:
**1.648** e **1.641**.

Script `scripts/manutencao/gerar-errata-truncamento.ts`:

- chama o motor **corrigido** (`getSnapshotRelatorioV2`) para o mesmo período/escopo;
- **insere linha NOVA** com `versao = max+1` do mesmo `(periodo_de, periodo_ate, filial_id)`
  — a v1 **nunca** é tocada (`relatorios_gerados` é imutável por regra);
- `gerado_por` = perfil de cargo **dev mais antigo ativo** (`8107851e…`, criado 10/07/2026);
- `observacao` explica: errata automática do truncamento de 1.000 linhas **+ a ressalva** de
  que exclusões feitas depois da geração original (ex.: resoluções de conflito entre
  filiais) não são reconstruíveis retroativamente;
- **idempotente**: se a v2 do período já existir com a marca de errata, não duplica;
- **backup JSON** das linhas candidatas para pasta temporária **fora do repositório**
  (autoproteção; ids v1→v2 vão para o relatório).

A UI já exibe "superada"/banner de errata sozinha (índice único
`relatorios_gerados_periodo_filial_versao_uidx`, migration `0013`).

### 3.5 Versão 1.40.2 (regra 8)

- `package.json` → `1.40.2` (patch: entrega avulsa fora de fase);
- entrada nova no topo de `src/lib/versoes/registry.ts`, **sem** campo `fase`, em
  **linguagem de operador** — o teste `registry.test.ts` recusa 21 termos literais
  (`RPC`, `Supabase`, `PostgREST`, `migration`, `deploy`, `schema`…);
- entrada no `CHANGELOG.md` com cabeçalho `## 17/08/2026 — …`;
- **tag anotada `v1.40.2`** no commit final, publicada;
- ata em `docs/DECISOES.md`.

---

## 4. Fora de escopo (não tocar)

- **`supabase/` inteiro** — a função SQL está correta; nenhuma migration, nenhum schema.
- **A config `max-rows` no painel** — subir o teto é mitigação frágil (volta a quebrar no
  próximo patamar e não vale para quem já consome a API); a correção é paginar no app.
- **Snapshots v1 existentes** — nunca apagar nem editar; errata é sempre linha NOVA.
- Dependências novas, refatoração oportunista, telas/UX, visualizador por senha, `mockups/`.
- **Nenhum dado real** em teste, fixture, comentário, relatório ou saída colada — só
  contagens e agregados (regra 2).

---

## 5. Verificação de ponta a ponta

| # | critério | como se prova |
|---|---|---|
| 1 | as-of paginado bate com a contagem bruta; nenhuma leitura devolve exatamente 1.000 | `scripts/manutencao/validar-truncamento.ts` contra produção; saída colada |
| 2 | `kpisAnterior.total` > 1.000 no consolidado da semana atual; Δ sem salto fantasma | mesmo script, caso do relatório ao vivo |
| 3 | todo ponto de leitura com veredito, nenhum "pode exceder 1.000" sem paginação | tabela completa da varredura no relatório |
| 4 | `npm run lint`, `npm run build`, `npm run test` verdes | saídas coladas |
| 5 | errata v2 gerada para todo elegível, v1 intocada, não-erratáveis listados com motivo | mapeamento v1→v2 no relatório |
| 6 | versão 1.40.2 completa | bump + registry + CHANGELOG + tag + ata |

Ordem: **1–4 verdes antes de a errata rodar.** Errata é escrita em produção — só depois de
o motor estar provado.

---

## 6. Incrementos (commits)

1. `fix(relatorios): pagina a leitura as-of do estoque` — núcleo + o bug principal + testes
2. `fix(relatorios): pagina as leituras de manutencao e a ultima observacao de itens`
3. `fix(queries): pagina a linha do tempo, os lados de conflito e a contagem de lancamentos`
4. `chore(manutencao): script so-leitura que valida o truncamento em producao`
5. `chore(manutencao): errata dos snapshots congelados com numeros truncados`
6. `chore(versao): 1.40.2` — bump + registry + CHANGELOG + ata
