# OS-F6A (ultracode) — Correções pós-go-live em execução paralela

Versão **executável e detalhada** da `F6A-correcoes-pos-golive.md`, escrita para o Claude Code com orquestração multi-agente ("ultracode"): as fases independentes rodam **em paralelo** por subagentes, a integração e o deploy são únicos no final. As decisões do Johnny (16/07/2026) estão na §5 da F6A original e repetidas dentro de cada fase aqui — são autoridade.

**Modo autônomo com acesso total (CLAUDE.md):** nenhum agente pede autorização — decide, implementa, aplica, registra em `docs/DECISOES.md` e autoverifica. O sistema está **em produção desde 15/07/2026** com dados reais: as autoproteções (backup, dry-run, contagens antes/depois) são obrigatórias, não opcionais.

## Como usar

Cole este arquivo **inteiro** numa sessão do Claude Code aberta na raiz do repositório. O orquestrador (você, sessão principal) segue a §1; os blocos §A1, §A4, §A5 e §A2 são os prompts completos de cada subagente — repasse cada bloco íntegro ao subagente correspondente.

---

## §1 — Orquestração (sessão principal)

### 1.1 Grafo de execução

```
ONDA 1 (paralela)          INTEGRAÇÃO (serial)              ONDA 2 (serial)
┌─ A1 entradas da carga ─┐
├─ A4 Total/Estoque ─────┼→ merge A1→A4→A5 → lint/test/build → migrations em produção
└─ A5 pendências ────────┘   (ordem fixa, re-teste após cada)   → deploy ÚNICO → A2 auditoria
                                                                  → correções → resumo final
```

- **A1 ∥ A4 ∥ A5** são independentes entre si (áreas disjuntas do domínio). Lance os três subagentes de uma vez, cada um em **worktree próprio** (branches `f6a-a1`, `f6a-a4`, `f6a-a5`).
- **A2 é a auditoria final** — só roda com tudo integrado e deployado, porque confere os números reais de produção pós-correções.

### 1.2 Regras globais (valem para todo subagente)

1. **Desenvolvimento contra Supabase de DEV/local** (`supabase start` ou projeto dev). **Nenhum subagente aplica migration em produção** — quem aplica é o orquestrador, na integração (§1.4). Nenhum subagente faz deploy.
2. **Migrations pré-alocadas** (evita colisão de numeração entre agentes paralelos; a última aplicada é a `0026_filial_serra.sql`):
   - `0027_itens_total_estoque.sql` → **A4**
   - `0028_v_pendencias_detalhe.sql` → **A5**
   - `0029_*` → **A1**, somente se escolher a rota 2 (marcador de dado); a rota preferida não tem migration
3. **Stack fechada** — nenhuma dependência nova. **Custo R$ 0.** **Nenhum dado real** em código/teste/fixture/screenshot (nem nome de colaborador, nem patrimônio real vindos do banco de produção durante diagnósticos — nos exemplos e testes, sempre fictício).
4. Convenções do CLAUDE.md: UI/commits em pt-BR, escrita via Server Action + Zod, banco snake_case, migration nova (nunca editar aplicada), shadcn intocado, datas `dd/MM/yyyy`.
5. Cada subagente entrega: código na sua branch + checklist da fase autoverificado + rascunho de entrada para `docs/DECISOES.md` + lista de pendências. Testes Vitest **só para função pura** (padrão do projeto).
6. `npm run lint`, `npm run test` e `npm run build` limpos **dentro do worktree** antes de se declarar pronto.

### 1.3 Mapa de propriedade de arquivos (anti-conflito)

| Área | Dono | Arquivos principais |
|---|---|---|
| Queries de movimentações do relatório | **A1** | `src/lib/queries/relatorios/movimentacoes.ts` |
| Constante do marcador da carga | **A1** | `src/lib/dominio.ts` (adição pontual) |
| Itens por quantidade (RPC/trigger/tela) | **A4** | `supabase/migrations/0027*`, `src/lib/queries/itens.ts`, `src/lib/actions/itens.ts`, `src/components/itens/*`, `src/app/(app)/itens/page.tsx`, `src/lib/queries/relatorios/itens.ts`, `src/lib/dominio.ts` (`TIPO_LANCAMENTO_META`, `INVERSO`) |
| Pendências (view/página/supressão) | **A5** | `supabase/migrations/0028*`, `src/lib/queries/relatorios/pendencias.ts`, `src/components/relatorios/pendencias-chips.tsx`, `src/app/(app)/pendencias/**` (novo), `src/components/layout/sidebar-nav.tsx`, `src/app/(app)/page.tsx` (card), `src/app/(app)/relatorios/**/page.tsx` (flag) |
| **Compartilhados (conflito esperado, merge com atenção):** `src/components/relatorios/corpo-relatorio-v2.tsx` (A4 mexe nos grupos de itens; A5 na seção Pendências), `corpo-relatorio.tsx` (A5), `src/lib/relatorios/tipos.ts` (A4: campos dos grupos; A5: assinatura do corpo) | A4+A5 | — |

Instrução aos agentes: **não tocar** em arquivo de outra área além do listado; se precisar, registrar no relatório final em vez de editar.

### 1.4 Integração (orquestrador, após a Onda 1)

1. Merge **na ordem fixa `f6a-a1` → `f6a-a4` → `f6a-a5`** na `main`; após cada merge, resolver conflitos (esperados só nos arquivos compartilhados da §1.3) e rodar `lint`+`test`+`build`. Commits no padrão: `fix(f6a): a1 — entradas da carga fora do período` etc.
2. **Produção — nesta ordem, com autoproteção:**
   a. Backup (export) das tabelas que as migrations tocam: `lancamentos_item`, `itens` (A4 não altera dados, mas o trigger muda — backup mesmo assim) e o SQL atual de `v_pendencias`/`rel_saldo_itens` (para rollback de definição).
   b. Aplicar `0027`, depois `0028` (e `0029` se existir) em produção, na ordem numérica.
   c. Smoke SQL pós-migration (cada fase define o seu na sua seção).
3. Deploy único na Vercel. Conferir `get_logs`/advisors do Supabase depois.
4. Lançar o subagente **A2** (bloco §A2) contra produção.
5. Aplicar as correções que a A2 apontar (pequenas: direto; estruturais: registrar como pendência), re-deploy se necessário.
6. **Resumo consolidado**: checklist geral (§4 da F6A original) + checklists por fase + entradas consolidadas em `docs/DECISOES.md` (data · contexto · escolha · motivo, uma por decisão relevante) + atualizar `README.md` (status F6A concluída) e a tabela em `docs/prompts/README.md`. Backlog do que surgiu fora do escopo.

---

## §A1 — Subagente A1: entradas da carga inicial fora do relatório do período

Você é um subagente executando a fase A1 da OS-F6A no repositório `ti-wap-inventory-control`, branch `f6a-a1`, em worktree próprio. Modo autônomo (CLAUDE.md). Desenvolvimento contra banco de DEV; você NÃO aplica nada em produção e NÃO faz deploy (o orquestrador integra). Escopo: somente esta fase.

### Problema (relatado pelo Johnny, 16/07/2026)

Filtrando o relatório por semana, aparecem centenas/milhares de ativos como se tivessem "entrado" no dia da carga (15/07/2026). A entrada exibida tem que refletir a entrada real; a carga inicial não é movimentação do período.

### Fatos verificados no código (confie neles, mas releia antes de editar)

- A carga (F4) criou, para cada ativo, uma **compra sintética de abertura**: `scripts/import/plano.ts:715-733`, com `observacao: 'carga go-live'`, `motivo: null`, `colaborador: null`, `chamado: null`. A data dela é a menor "Data de Inclusão/Entrega" válida da planilha — **com fallback `hoje` (= 15/07/2026) quando o inventário não tinha data válida** (`plano.ts:359`). Daí a concentração no dia da carga.
- Os **ajustes de reconciliação** da carga têm `observacao: 'carga go-live: estado conforme planilha (divergência documentada)'` e `tipo='ajuste'` — **já são invisíveis** ao relatório (nenhuma tabela/RPC conta `ajuste`). Não mexa neles.
- O **replay** de Saída/Devolução gravou datas **reais** das planilhas (`plano.ts:767-784`) — são histórico legítimo; se caírem num período filtrado, DEVEM aparecer. Não filtre replay.
- **Cuidado:** existe compra legítima da carga com `observacao: 'entrada por compra (planilha de Devolução)'` e data real (`plano.ts:559-570`). NÃO pode ser excluída.
- **Marcador confiável:** `observacao = 'carga go-live'` (igualdade exata) isola exatamente as compras sintéticas de abertura. `criado_por` NÃO serve (é o mesmo admin do uso normal).
- Quem exibe as entradas: `getTabelasFinais` → `buscarLinhasPeriodo` em `src/lib/queries/relatorios/movimentacoes.ts:243-331` — Entradas = `.in('tipo', ['devolucao','compra'])` + `.gte/.lte('data', ...)`. O total "Entradas N" é `rows.length` (`src/components/relatorios/tabela-entradas.tsx:44-48`).
- `getUltimasMovimentacoes` (`movimentacoes.ts:204-225`) também lista todos os tipos por `data` no período — as compras sintéticas aparecem lá também.
- KPIs **não** são de fluxo (contam estado por status — `estoque.ts`), a série (`rel_mov_por_mes`) e as RPCs da `0011` só contam `saida`/`devolucao` — **não são afetados, não mexa**.
- **PROIBIDO deletar ou re-datar** as compras sintéticas: a RPC `rel_estoque_asof` (migration `0022_asof_existencia.sql`) usa a existência de ≥1 movimentação com `data <= p_data` como âncora de existência do ativo (`where existe`), e a filial as-of ancora em `tipo='compra'`. Apagar/re-datar quebra o estoque histórico dos 1.596.

### Passos

1. **Diagnóstico (leitura, banco de produção é permitido para SELECT):** conte `movimentacoes` com `observacao = 'carga go-live'` (esperado ≈ nº de ativos da carga), quantas dessas têm `data = '2026-07-15'` vs data histórica; conte compras legítimas (`observacao = 'entrada por compra (planilha de Devolução)'`) e compras operacionais pós-go-live. Guarde os números para o relatório.
2. **Rota preferida — filtro na camada de leitura (sem migration, sem tocar dado):**
   - Crie a constante exportada `OBS_CARGA_GOLIVE = 'carga go-live'` em `src/lib/dominio.ts` (com comentário apontando `scripts/import/plano.ts`). Se conseguir importar essa constante no `plano.ts` sem quebrar os testes do script, unifique a fonte; senão, adicione um teste Vitest que falhe se os dois literais divergirem.
   - Em `buscarLinhasPeriodo`/`getTabelasFinais` e em `getUltimasMovimentacoes`, exclua as linhas da carga. **Atenção ao PostgREST:** `.neq('observacao', OBS_CARGA_GOLIVE)` descarta também `observacao IS NULL` — use `.or('observacao.is.null,observacao.neq.' + …)` com o escape correto, e confirme o comportamento com a doc atual do supabase-js (regra 6 do CLAUDE.md). Valide com uma query de teste que linhas com observação nula continuam vindo.
   - O filtro vale para **Entradas, Saídas, Transferências e Últimas movimentações** (as sintéticas são só `compra`, mas o filtro uniforme é inofensivo para os outros tipos — nenhuma movimentação legítima carrega exatamente esse texto) — decida e registre.
3. **Rota 2 (só se a rota preferida se mostrar frágil):** migration `0029` cria coluna `carga boolean not null default false` em `movimentacoes` + `update ... set carga = true where observacao = 'carga go-live'`; queries filtram `carga = false`. Exige backup prévio da tabela e contagens antes/depois — e o orquestrador aplica em produção, não você. Registre a escolha em `DECISOES.md` (rascunho).
4. **Não toque**: `rel_estoque_asof`, série, RPCs 0011, KPIs, scripts de import (além da eventual unificação da constante), linha do tempo da ficha (o evento de carga continua visível lá — é histórico legítimo).

### Aceite da fase (autoverifique e reporte)

- [ ] Relatório da semana atual (dev, com dados de seed + linhas sintéticas de teste marcadas com `'carga go-live'`): Entradas mostram só movimentações operacionais; a sintética some; a compra com observação `'entrada por compra (planilha de Devolução)'` e data no período **continua aparecendo**
- [ ] Linhas com `observacao` nula continuam nas tabelas (gotcha do `.neq` verificado)
- [ ] Últimas movimentações sem as sintéticas
- [ ] `rel_estoque_asof` intocada; contagem as-of de uma data passada idêntica antes/depois da mudança (rode em dev)
- [ ] Nenhum KPI/série/RPC alterado
- [ ] `lint` + `test` + `build` limpos no worktree; teste da constante presente
- [ ] Relatório final: números do diagnóstico de produção, rota escolhida + motivo, rascunho para `DECISOES.md`

---

## §A4 — Subagente A4: itens por quantidade — Total / Estoque e a nova semântica

Você é um subagente executando a fase A4 da OS-F6A no repositório `ti-wap-inventory-control`, branch `f6a-a4`, worktree próprio. Modo autônomo (CLAUDE.md). Desenvolvimento contra banco de DEV; a migration `0027` que você escrever será aplicada em produção **pelo orquestrador**. Você não deploya.

### Decisão do Johnny (16/07/2026) — semântica alvo

| Conceito | Definição | O que move |
|---|---|---|
| **Total** | tudo que a filial possui do item (prateleira + com pessoas) | entrada (compra/recebimento), ajuste (± com justificativa; negativo = baixa definitiva: descarte/perda) |
| **Estoque** | disponível na prateleira | atrelar → −1 · liberação → −1 · devolução do item → +1 |
| Em uso (= Total − Estoque) | atrelados (saíram acompanhando ativo/chamado, vão voltar) + liberados (ficaram definitivamente com a pessoa) | derivado |
| **Falta** | mantém o espírito atual (demanda atrelada que não cabe no estoque) | derivado |

"Atrelar" = item acompanha um ativo/chamado e **retorna** na devolução. "Liberação" = item **fica** com a pessoa (não retorna), mas continua contando no Total ("com pessoas"). "Devolução" = item atrelado voltou → repõe Estoque.

### Fatos verificados no código — LEIA COM ATENÇÃO, há colisões

1. **saldo/atrelados/falta NÃO são colunas** — são derivados 100% na RPC `rel_saldo_itens` (criada na `0016`, versão vigente na `0019_f3b_correcoes.sql`) a partir do diário imutável `lancamentos_item` (`0015`). O trigger `trg_valida_lancamento_item` → `valida_lancamento_item()` (0015 → 0019 advisory lock → **0024 versão vigente**, `search_path`) apenas **valida** (saldo não-negativo; liberação ≤ reserva aberta do chamado) — não materializa nada. Mudar a semântica = nova migration recriando **RPC + trigger**, sem DDL de coluna e **sem recálculo de dados** (a derivação nova vale retroativamente sozinha).
2. **Não existe vínculo item↔ativo no banco.** O "atrelado" de hoje é a `reserva` por **`chamado` (texto)**; `saida`/`liberacao` do mesmo chamado fecham o bucket: `atrelados = Σ_chamado max(0, Σreserva − Σliberacao − Σsaida)`. O array `movimentacoes.itens_faltantes` é texto livre, desconectado do catálogo — não o envolva.
3. **COLISÃO DE NOME:** o enum `tipo_lancamento` (`'entrada','saida','reserva','liberacao','ajuste'`) já tem `liberacao` com sentido **OPOSTO** ao do Johnny: hoje `liberacao` = *cancela reserva sem consumir* (desatrela, devolve à prateleira) — é exatamente a "devolução repõe" da semântica nova. E o `saida` de hoje (*entrega/consumo, baixa o saldo para sempre*) é exatamente a **"liberação — ficou com a pessoa"** do Johnny.
4. Hoje: `saldo = Σentrada − Σsaida ± ajuste` (clamp ≥0 na 0019); `falta = max(0, atrelados − saldo)`; **reserva não baixa o saldo** (só conta em atrelados). É por isso que "atrelar não desconta o estoque" hoje.
5. UI: tela `src/app/(app)/itens/page.tsx` (colunas **Item / Saldo / Atrelados / Falta**); dialog `src/components/itens/lancar-item-dialog.tsx` (`TIPOS`, rótulos de `TIPO_LANCAMENTO_META` em `src/lib/dominio.ts`); estorno com mapa `INVERSO` em `src/lib/actions/itens.ts` (entrada↔saida, reserva↔liberacao, ajuste→ajuste invertido); histórico em `src/components/itens/historico-lancamentos.tsx`.
6. Relatório v2: `getGruposItens` (`src/lib/queries/relatorios/itens.ts`) usa `rel_saldo_itens` + `rel_mov_itens` + `rel_frescor_itens`; grupos renderizados em `corpo-relatorio-v2.tsx` via `TabelaItensGrupo` (colunas saldo/atrelados/falta) e `BarrasDivergentes`. O snapshot congelado (`SnapshotRelatorioV2.grupos` em `src/lib/relatorios/tipos.ts`) grava esses campos — **snapshots antigos têm a chave `saldo`** e precisam continuar abrindo.
7. Realtime já cobre `lancamentos_item` (`0018`); `getSaldosItens` (`src/lib/queries/itens.ts`) chama a RPC com `p_ate = hoje`.
8. Carga F4 de itens usa `observacao = 'saldo inicial (go-live)'` como `entrada` — na semântica nova vira Total inicial, correto por construção. A F6C (carga futura) entrará como `entrada` também.

### Desenho recomendado (valide, ajuste se o código contrariar, registre em DECISOES)

**Sem renomear valores de enum** (quebraria histórico/código); a reconciliação de nomes é **de rótulo (UI)**:

| Valor do enum (imutável) | Rótulo novo na UI | Efeito na semântica nova |
|---|---|---|
| `entrada` | Entrada (compra/recebimento) | Total +q · Estoque +q |
| `saida` | **Liberação — ficou com a pessoa** | Estoque −q · em uso +q · Total = |
| `reserva` | **Atrelar (a chamado/ativo — vai retornar)** | Estoque −q · atrelados +q · Total = |
| `liberacao` | **Devolução de item (repõe o estoque)** | Estoque +q · atrelados −q · Total = |
| `retorno` (**novo valor de enum**, `0027`) | Retorno de liberação (voltou para a prateleira) | Estoque +q · em uso −q · Total = |
| `ajuste` | Ajuste de inventário (± com justificativa) | Total ±q · Estoque ±q |

Derivações na RPC nova (`rel_saldo_itens`, migration `0027`, `create or replace`):
- `total = max(0, Σentrada + Σajuste)`
- `atrelados = Σ_chamado max(0, Σreserva − Σliberacao − Σsaida)` (mantém a regra: `saida` no mesmo chamado consome a reserva — o atrelado virou liberado, não conta duas vezes)
- `liberados = Σsaida − Σretorno` (clamp ≥ 0)
- `estoque = max(0, total − atrelados − liberados)`
- `falta = max(0, atrelados − estoque)`
- Retorne colunas: `item_id, item, grupo, ordem, total, estoque, atrelados, falta` (mantenha também `saldo` = `estoque` como alias na RPC **ou** trate a compat no TypeScript — decida e registre; o que importa é snapshot antigo continuar abrindo e código novo usar total/estoque).

Trigger novo (mesma migration, `create or replace function valida_lancamento_item`): preserve o advisory lock (0019) e o `search_path` (0024); as validações passam a ser sobre a semântica nova — `saida`/`reserva` não podem deixar `estoque < 0`; `liberacao` ≤ reserva aberta do chamado (mantém); `retorno` ≤ liberados em aberto (Σsaida − Σretorno); `ajuste` não pode deixar `total < 0` nem `estoque < 0`. `retorno` **não exige chamado** (liberação pode ter sido sem chamado), mas aceite-o opcional.

Estorno (`src/lib/actions/itens.ts`, mapa `INVERSO`): **atualize** — o inverso de `saida` deixa de ser `entrada` (inflaria o Total) e passa a ser `retorno`; inverso de `retorno` = `saida`; demais pares mantêm (`entrada`↔? — entrada estornada tira do Total: hoje o inverso de entrada é `saida`, que na semântica nova NÃO baixa Total → o estorno de `entrada` deve virar `ajuste` negativo com observação automática, ou outro desenho que baixe o Total; decida pela consistência e registre).

### Passos

1. Migration `supabase/migrations/0027_itens_total_estoque.sql`: `alter type ... add value 'retorno'` (transação própria se necessário — teste no dev), nova `rel_saldo_itens`, novo `valida_lancamento_item`, comentários no SQL explicando a semântica. Smoke SQL no final do arquivo em comentário (para o orquestrador rodar em produção): um select da RPC comparando `total ≥ estoque`, nenhum negativo.
2. `npm run db:types` (regenerar `src/lib/types/database.ts`).
3. TypeScript: `getSaldosItens`/tipos `SaldoItem` ganham `total`/`estoque`; `TIPO_LANCAMENTO_META` e `TIPOS` do dialog ganham `retorno` + rótulos novos (com descrições curtas no dialog para o operador entender o que cada tipo faz); mapa `INVERSO`; histórico exibe o tipo novo.
4. Tela `/itens`: colunas **Item / Total / Estoque / Atrelados / Falta** (subtítulo da página atualizado; `tabular-nums`; badge `faltam N` mantém).
5. Relatório v2 (`getGruposItens`, `TabelaItensGrupo`, `tipos.ts`): grupos exibem Total/Estoque (decida o layout mínimo que não quebra snapshot antigo: renderização tolerante — se o snapshot só tem `saldo`, mostre como antes; se tem `total`/`estoque`, mostre as colunas novas).
6. Testes Vitest para a lógica pura que criar/alterar (ex.: mapeamento INVERSO, helpers de rótulo). A validação da RPC/trigger é por SQL no dev (documente os casos rodados: atrelar→estoque cai; devolver→volta; liberar→estoque cai e total fica; retorno→estoque volta; tentativa de estoque negativo → erro).

### Aceite da fase (autoverifique e reporte)

- [ ] No dev: sequência completa validada por SQL — entrada 10 → Total 10/Estoque 10; atrelar 2 → Estoque 8, atrelados 2; devolução 1 → Estoque 9, atrelados 1; liberação 3 → Estoque 6, Total 10; retorno 1 → Estoque 7; ajuste −2 → Total 8/Estoque 5; falta aparece quando atrelados > estoque
- [ ] Trigger rejeita: saída/atrelagem além do estoque; liberação além da reserva do chamado; retorno além do liberado
- [ ] Estorno de cada tipo produz o inverso correto (incluindo o desenho novo para `entrada` e `saida`) e continua bloqueando estorno duplo
- [ ] Tela `/itens` com Total/Estoque; dialog com os 6 tipos rotulados; realtime segue funcionando
- [ ] Relatório v2 exibe a semântica nova; snapshot v2 **antigo** (com `saldo`) continua abrindo sem erro
- [ ] `db:types` regenerado; `lint`+`test`+`build` limpos no worktree
- [ ] Relatório final: decisões (alias saldo, estorno de entrada, layout dos grupos) + rascunho para `DECISOES.md` + smoke SQL para o orquestrador

---

## §A5 — Subagente A5: pendências só para o operador, com página própria

Você é um subagente executando a fase A5 da OS-F6A no repositório `ti-wap-inventory-control`, branch `f6a-a5`, worktree próprio. Modo autônomo (CLAUDE.md). Desenvolvimento contra banco de DEV; a migration `0028` será aplicada em produção pelo orquestrador. Você não deploya.

### Decisão do Johnny (16/07/2026)

Pendência é assunto interno da TI: **o visualizador por senha não vê pendência em lugar nenhum** (relatório ao vivo, snapshot novo, snapshot antigo). O operador ganha uma **página interna `/pendencias`** com a lista detalhada (ativo, pessoa, desde quando, o que falta) e filtros.

### Fatos verificados no código — o ponto de corte é CÓDIGO, não RLS

1. O visualizador por senha usa o **client administrativo (service_role), que ignora RLS** (`resolverAcessoRelatorio` em `src/lib/auth/acesso.ts:77-87` → `modo: 'viewer'`). Suprimir pendência para ele é decisão de **código de renderização/queries** — mexer em policy não adianta.
2. Fluxo atual: `/(app)/relatorios/[filial]/page.tsx` chama `getSnapshotRelatorioV2(acesso.client, ...)` que embute `getPendencias(...)` no snapshot (`snapshot.ts`, campo `pendencias`); `CorpoRelatorio` (`corpo-relatorio.tsx`) despacha para `CorpoRelatorioV2` (chips na seção "Pendências", linhas ~167-173) ou `CorpoRelatorioV1` (snapshots antigos, chip sem guarda). **Nenhuma flag operador/viewer chega ao corpo hoje** — `acesso.modo` só controla chrome (RealtimeRefresh vs ViewerAutoRefresh, botão Gerar).
3. **Snapshots congelados contêm os chips no jsonb** (`relatorios_gerados.dados.pendencias`) — a supressão para viewer tem que ser **no render** (vale para v1 e v2, ao vivo e `gerados/[id]`), não só na geração futura. Não mexa no jsonb congelado.
4. A rota nova `/(app)/pendencias` **já nasce bloqueada para o viewer** pelo proxy (`src/lib/supabase/proxy.ts`: sem operador, só `/relatorios/**` passa com cookie `wap_view`; resto → `/login`). O layout já dá shell reduzido ao viewer. Não precisa de guard extra além do `getOperador()` padrão das páginas internas.
5. `v_pendencias` (versão vigente na **`0021_termos_gerados.sql:64-81`**, `security_invoker`): uma linha por ativo pendente, colunas `id, patrimonio, categoria, filial (slug), status, pendencia`. Categorias: `'triagem parada'` (em_triagem há >7 dias via `updated_at`), `'termo pendente'` (`termo_assinado in ('nao','enviado','gerado')` ou null, com status em_uso/emprestado), e texto livre de `ativos.pendencia` (ex.: `'itens faltantes: carregador, mochila'`, gravado pelo trigger da `0023`). **Faltam colunas para a lista detalhada**: colaborador, datas, modelo.
6. Dados disponíveis em `ativos` (`0003_tabelas.sql`): `colaborador_atual`, `setor_atual`, `termo_assinado`, `termo_data`, `updated_at`, `marca`, `modelo`, `status`. "Desde quando": triagem → `updated_at`; termo → `termo_data` (pode ser null); itens faltantes → `updated_at` da devolução.
7. Chips: `getPendencias` (`src/lib/queries/relatorios/pendencias.ts`) monta 4 buckets por contagem na view (`termo`, `itens` via `ilike 'itens faltantes%'`, `triagem`, `outras`). Dashboard home (`src/app/(app)/page.tsx:51-108`) já lista 5 pendências com link `/ativos/{id}` — bom modelo.
8. Sidebar: array estático `ITENS` em `src/components/layout/sidebar-nav.tsx:23-30` (`{rotulo, icone, href, match}`); não há padrão de badge numérico (não invente um agora — item simples).
9. Existe o teste-tripwire `src/lib/queries/relatorios/fronteira-viewer.test.ts` (queries de relatório não podem referenciar tabelas sensíveis) — mantenha-o verde.

### Passos

1. **Migration `supabase/migrations/0028_v_pendencias_detalhe.sql`:** `create or replace view v_pendencias` mantendo `security_invoker = true` e as colunas/condições atuais **intactas** (não quebre `getPendencias`), adicionando: `colaborador_atual`, `setor_atual`, `marca`, `modelo`, `termo_data`, `updated_at` e `filial_nome` (join já existe). Comente o SQL. Smoke (comentário p/ orquestrador): contagem total da view antes = depois.
2. **Flag de acesso no render:** propague `ehOperador: boolean` de `/(app)/relatorios/[filial]/page.tsx` (derivada de `acesso.modo === 'operador'`) e de `/(app)/relatorios/gerados/[id]/page.tsx` (ali a página é interna; mas snapshots também são vistos por viewer? — verifique: `gerados` está sob `/relatorios/**`, então o viewer ACESSA; derive a flag pelo mesmo `resolverAcessoRelatorio`) até `CorpoRelatorio` → `CorpoRelatorioV2` **e** `CorpoRelatorioV1`: a seção "Pendências" só renderiza com `ehOperador`. Default seguro: `false` (se ninguém passar, não mostra).
3. **Snapshot ao vivo do viewer:** além do render, avalie não nem buscar `getPendencias` quando viewer (economia e defesa em profundidade) — se fizer, mantenha o tipo do snapshot estável (campo `pendencias: []`) para não quebrar o congelamento. Decida e registre.
4. **Página nova `src/app/(app)/pendencias/page.tsx`** (Server Component, `getOperador()` + redirect como as demais):
   - KPI-chips no topo (reuso de `getPendencias` — total por bucket, consolidado ou da filial filtrada).
   - Tabela detalhada da `v_pendencias` estendida: colunas Tipo (badge por bucket), Patrimônio (formato canônico, link `/ativos/{id}`), Categoria/Modelo, Colaborador, Setor, Filial, **Desde** (data-base por tipo: `termo_data ?? updated_at` para termo; `updated_at` para triagem/itens; exiba `dd/MM/yyyy` + "há N dias", `tabular-nums`).
   - Filtros via searchParams: filial (select), tipo (chips/tabs: termos, itens faltantes, triagem, outras), busca por patrimônio/colaborador. Ordenação default: mais antiga primeiro.
   - Paginação server-side se necessário (siga o padrão de `/ativos`); leitura via função nova em `src/lib/queries/` (ex. `pendencias-detalhe.ts`) com tipos gerados.
   - Estrutura pensada para receber ações inline no futuro (B6 da F6B: "confirmar assinatura") — não implemente a ação, só não pinte o layout num canto que impeça uma coluna de ações.
5. **Sidebar:** item "Pendências" (ícone Lucide coerente, ex. `ClipboardAlert`/`AlertTriangle`) entre "Itens" e "Relatórios".
6. **Dashboard home:** o card de pendências existente ganha link "ver todas" → `/pendencias` (mantém as 5 linhas).
7. Rode `fronteira-viewer.test.ts` e o resto da suíte.

### Aceite da fase (autoverifique e reporte)

- [ ] Sessão por senha (dev): relatório ao vivo sem seção Pendências; snapshot gerado (novo) sem; snapshot antigo v1/v2 (com chips no jsonb) renderiza **sem** os chips; operador continua vendo em ambos
- [ ] `/pendencias` (operador): lista detalhada com link pra ficha, "desde/há N dias" correto por tipo, filtros de filial/tipo/busca funcionando, contagens batendo com `getPendencias`
- [ ] Viewer tentando `/pendencias` → redirect `/login` (comportamento do proxy confirmado)
- [ ] `v_pendencias` estendida: contagem total idêntica à anterior; `getPendencias` intocado e funcionando
- [ ] Sidebar e card do dashboard atualizados; `fronteira-viewer.test.ts` verde
- [ ] `db:types` se necessário; `lint`+`test`+`build` limpos no worktree
- [ ] Relatório final: decisões (flag no render vs snapshot, desenho da página) + rascunho para `DECISOES.md`

---

## §A2 — Subagente A2 (ONDA 2): auditoria dos números do relatório

Você é um subagente executando a fase A2 da OS-F6A, a **auditoria final**, na `main` já integrada e deployada (A1+A4+A5 em produção). Modo autônomo. Você pode rodar SELECTs em produção à vontade; correção de **código** faz em branch `f6a-a2` para o orquestrador integrar; correção de **dado** só com backup prévio + registro. Nenhum dado real (patrimônio/nome vindo do banco) pode parar em arquivo do repositório — os achados vão no relatório da sessão com patrimônios mascarados quando possível.

### Missão (decisão do Johnny: "números do relatório suspeitos")

Conferir **cada número** que o relatório por filial exibe contra SQL direto no banco de produção, nos dois regimes de estado: `ate = hoje` (fast path: lê `ativos.status`) e `ate` no passado (RPC `rel_estoque_asof`). Escopo: consolidado `geral` + 2 filiais (escolha as de maior movimento), 2 períodos cada (semana atual; um período fechado do passado, ex. 01/06–30/06).

### Roteiro de conferência (bloco → fonte → SQL de referência)

Use esta tabela como checklist. "Fonte" é o código vigente (confira se a integração não o moveu):

| # | Bloco na tela | Fonte | O que o SQL de referência confere |
|---|---|---|---|
| 1 | 7 KPI tiles (total, em uso, em estoque, reservado, em triagem, em manutenção, defasado) | `kpisDeEstado`/`lerEstadoAtivos` (`estoque.ts`) | `select status, count(*) from ativos where status <> 'descartado' [and filial_id=..] group by status` (hoje) e `select * from rel_estoque_asof(filial, ate)` agregado (passado). `emprestado` não tem tile no topo — confira que soma no `total` |
| 2 | Δ dos KPIs | `kpisAnterior` = estado as-of da **véspera de `de`** (`periodoAnterior`, `snapshot.ts:34-39`) | recompute: Δ = retrato(ate) − retrato(de−1). É retrato×retrato, NÃO fluxo — confirme que a UI bate com essa definição |
| 3 | Card "Movimentações" (série) | dia/semana: query direta `tipo in ('saida','devolucao')`; mês: `rel_mov_por_mes` (0011) | soma dos pontos = `select count(*) ... where tipo in ('saida','devolucao') and data between de and ate` |
| 4 | "Estoque no último dia" (barras por categoria×status) | `estoqueCatStatusDeEstado` | mesma base do #1 agrupada por categoria — atenção: inclui TODOS os status ≠ descartado (não só em_estoque) |
| 5 | "Disponíveis por modelo" (+ subtítulo com nº) | `disponiveisPorModeloDeEstado` — só `em_estoque` | `select marca, modelo, count(*) ... where status='em_estoque' group by 1,2`; subtítulo = KPI em_estoque |
| 6 | "Reservados" | `reservadosDeEstado` (chamado = última mov com chamado ≤ ate) | lista de `status='reservado'` + chamado da última movimentação |
| 7 | "Em manutenção, caso a caso" (+ dias) | `manutencaoDeEstado` (as-of ∪ retornos no período; dias = envio→retorno/fim) | reconstrua 2–3 casos à mão pela linha do tempo |
| 8 | "Saídas/Devoluções por motivo" | `rel_por_motivo` (0011) | `group by motivo` com join `motivos`, nulo → "Outro" |
| 9 | Grupos Acessórios/Componentes (Total, Estoque, atrelados, falta, entradas×saídas, frescor) | `rel_saldo_itens` **v3 (0027)**, `rel_mov_itens`, `rel_frescor_itens` | recompute por SQL as regras da A4 (total/estoque/atrelados/falta) para 3+ itens; entradas×saídas do período |
| 10 | Tabelas Saídas / Entradas / Transferências (+ total `rows.length`) | `getTabelasFinais` **pós-A1** | contagens por tipo no período **excluindo** `observacao = 'carga go-live'`; Entradas devem conter devolucao+compra legítimas; transferência aparece na origem e no destino |
| 11 | Resumo do período | `rel_resumo` (0011) | totais de saída/devolução por filial/motivo/categoria batem com #3/#8 |
| 12 | Pendências (chips, agora só operador) | `getPendencias`/`v_pendencias` **pós-A5** | contagens por bucket = selects diretos na view; viewer não vê (teste manual com cookie de senha) |

### Regras da auditoria

1. Monte a tabela de conferência: bloco × contexto (filial/período) × valor exibido × valor SQL × veredito (`ok` / divergente).
2. **Divergência → primeiro entenda** (fast path vs as-of? fuso? clamp?), depois corrija a **lógica** no código (branch `f6a-a2`). Correção de **dado** só se comprovar erro da carga (backup da tabela antes, update cirúrgico, contagens antes/depois, registro em DECISOES).
3. Casos-limite obrigatórios: ativo com múltiplos resultados de patrimônio (par patrimônio+service tag); período de 1 dia; filial `serra` (renomeada na 0026); snapshot congelado antigo aberto lado a lado com o ao vivo do mesmo período (diferenças esperadas: pendências são do instante da geração — `now()`-relativas).
4. Entregável: tabela completa no relatório final + correções aplicadas/pendentes + rascunho para `DECISOES.md`.

### Aceite da fase

- [ ] Tabela de conferência completa (12 blocos × 3 escopos × 2 períodos, ou justificativa do recorte)
- [ ] Zero divergência sem explicação e sem correção/pendência registrada
- [ ] Casos-limite rodados; viewer conferido sem pendências
- [ ] `lint`+`test`+`build` limpos se houve código; backups antes de qualquer dado corrigido

---

## §2 — Aceite geral da OS (orquestrador, ao final)

- [ ] Onda 1 integrada na ordem A1→A4→A5 com re-teste após cada merge; conflitos só nos arquivos previstos (§1.3)
- [ ] Migrations `0027`, `0028` (e `0029` se existir) aplicadas em produção **na ordem**, com backups prévios e smoke SQL de cada fase rodado
- [ ] Deploy único; logs/advisors do Supabase conferidos depois
- [ ] A2 executada em produção; correções aplicadas; tabela de conferência arquivada no resumo
- [ ] Checklists das 4 fases autoverificados; `npm run lint` + `test` + `build` limpos na `main`
- [ ] `docs/DECISOES.md` consolidado (uma entrada por decisão relevante das 4 fases); `README.md` e `docs/prompts/README.md` atualizados (F6A concluída; próximo: F6B)
- [ ] Nenhum dado real em código/teste/fixture; nenhuma dependência nova; custo R$ 0
- [ ] Resumo final: o que mudou por fase, decisões, pendências/backlog (fora de escopo vai para o backlog, não se faz)
