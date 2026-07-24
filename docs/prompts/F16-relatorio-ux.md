# F16 — Melhorias de leitura e navegação no relatório (UX)

> Ordem de serviço executada em modo autônomo (ver `CLAUDE.md`). Seis melhorias de
> leitura/navegação no relatório (ao vivo e snapshots), **sem migration, sem
> dependência nova, compatíveis com snapshots já gerados**.

## Missão

Executar seis melhorias de leitura e navegação no relatório (ao vivo e snapshots):
sinalização de movimentações estornadas nas tabelas, Δ dos KPIs com semântica por
indicador, busca livre nas tabelas detalhadas com patrimônio linkando para a ficha,
KPI tiles clicáveis para o operador, acesso por toque ao conteúdo escondido no mobile
e escalonamento de manutenção parada há 30+ dias. Zero migration, zero dependência
nova, compatibilidade total com snapshots já gerados.

## Contexto

- `CLAUDE.md` — modo autônomo, stack fechada e convenções valem integralmente.
- Spec do relatório: `docs/ESPECIFICACAO.md` §7 (autoridade nº 1). Corpo v2:
  `src/components/relatorios/corpo-relatorio-v2.tsx`. Tipos do snapshot:
  `src/lib/relatorios/tipos.ts` — padrão de compatibilidade: campo novo é OPCIONAL e
  `schema: 2` não muda (precedentes: `emprestado?`, `movimentacoesItens?`, `total?/estoque?`).
- Montagem do snapshot: `src/lib/queries/relatorios/snapshot.ts` e módulos irmãos
  (estoque.ts, movimentacoes.ts, itens.ts, pendencias.ts). Filtros de tabela com estado
  na URL: `src/components/relatorios/use-filtros-tabela.ts` e o `.test.ts` — siga
  exatamente esse padrão para estado novo de filtro/busca.
- KPIs: `src/components/relatorios/kpi-tiles.tsx` (aceita `links`, hoje só o dashboard usa).
  Manutenção: `src/components/relatorios/manutencao-casos.tsx` e `manutencaoDeEstado` em
  queries/relatorios/estoque.ts.
- Estorno de movimentação: spec §8 regra 6. Descobrir o mecanismo real (migrations +
  `src/components/ativos/linha-do-tempo.tsx`, que já exibe estornos na ficha).
- Duas audiências: operador logado (`ehOperador=true`) e visualizador por senha (sem
  conta, restrito a /relatorios/**). O viewer NUNCA ganha link para fora de /relatorios/**
  nem vê a seção Pendências (decisão A5/F6A — o corte é no render).

## Tarefas

**T1 — Estornos sinalizados nas tabelas detalhadas.** Toda linha cuja movimentação foi
estornada nasce sinalizada: campo opcional novo na linha do snapshot (`estornada?: true`
+ data), visual discreto (badge + linha esmaecida, tooltip com a data), operador E viewer,
inclusive na impressão. Na tabela de movimentações de itens, marcar também o lançamento
estornado (hoje só o de estorno tem `ehEstorno`). NÃO alterar contagens; INVESTIGAR se as
agregações contam estornadas e documentar o achado + pergunta aberta em `docs/DECISOES.md`.

**T2 — Δ dos KPIs com semântica por indicador.** Subir é BOM (verde) em "Em estoque"/
"Guardados"; subir é RUIM (vermelho) em "Em manutenção"/"Em triagem"; os demais NEUTROS
(cinza). Vale para KpiTiles e GrupoKpis. A cor nunca é o único canal (seta permanece).
Dashboard e snapshots antigos não mudam. Mapa de sentido = função pura com teste.

**T3 — Busca livre + patrimônio → ficha.** Cada tabela detalhada ganha UM campo de busca
livre que filtra as linhas já carregadas em qualquer coluna textual (patrimônio inclusive
fora do formato canônico), sem sensibilidade a caixa/acento, persistido na URL sob o
prefixo da tabela (`sd.q`, `en.q`, ...) e composto com os filtros existentes; "X de N"
correto. Para o OPERADOR, patrimônio (linhas e cards de manutenção) vira link para
`/ativos/[id]`: `ativoId?` opcional. Viewer: texto puro. Snapshots antigos: sem link.

**T4 — KPI tiles clicáveis no ao vivo.** Para o operador, os tiles linkam para /ativos
filtrado por status (+ filial quando não consolidado). Encanamento page→CorpoRelatorio→
CorpoRelatorioV2→KpiTiles. Snapshot e viewer: sem links. Dashboard intacto.

**T5 — Conteúdo escondido no mobile com porta de entrada.** Onde as tabelas escondem
colunas, cada linha ganha acesso por toque ao que sumiu (linha expansível, chevron,
aria-expanded, alvo ≥40px), rótulo:valor. 4 tabelas detalhadas + Obs do saldo por item.
Desktop e impressão não mudam; 375px sem scroll lateral novo.

**T6 — Manutenção parada escala aos 30 dias.** Caso ABERTO com `diasEmManutencao` ≥ 30:
badge muda de âmbar para vermelho (ao vivo + snapshots novos); builder acrescenta às
Pendências do operador um chip "Manutenção parada (30+ dias)" com a contagem. Limiar =
constante nomeada (30) com teste. Viewer vê o badge, não o chip.

**Transversal:** atualizar a ajuda (conteudo.ts + testes) e acrescentar "(Emenda F16)" na
spec §7.

## Fora de escopo

Nenhuma migration/RPC nova, nenhuma dependência nova, nenhuma mudança em contagens.
database.ts (gerado), templates/, migrations/, fluxo de movimentação, telas de admin,
dashboard (além de não regredir), corpo v1 (só compartilhado). Adiados: selo "repor",
snapshot automático da sexta, motivo da regeração, T11, export/HTML autocontido.

## Verificação

`npm run lint` · `npm run test` · `npm run build` verdes antes e depois de cada tarefa.
Vitest só funções puras. Revisão adversarial 5 lentes (F14/F15). Branch `f16-relatorio-ux`.
