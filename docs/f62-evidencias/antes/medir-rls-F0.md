# Linha de base do `medir-rls` (forma F0) — ENSAIO, ANTES da F62

- Quando: 22/09/2026, antes do primeiro apply da F62.
- Comando gerado: `node scripts/perf/medir-rls.mjs gerar --alvo ensaio --ref sgmvldiizsrjbxzzpmhh --canal mcp --dir <scratchpad>`
  (4 blocos `do $f59$ … raise exception`); executado `ensaio-ativos-admin.sql` pelo MCP (`execute_sql`).
- Identidade: escolhida DENTRO do banco (primeiro perfil admin/dev ativo por id) — o id não saiu.

| forma | nós | subplanos (loops) | exec mediana (ms, N=9) | custo | linhas |
|---|---|---|---|---|---|
| **F0** (o piso de hoje) | Seq Scan, Result | **InitPlan 1 (1)** | **0,624** | 63,32 | 1606 |
| F1 (por linha) | Seq Scan, Result | InitPlan 1 (1) | 22,458 | 464,82 | 1606 |
| F2 (falso içamento) | Seq Scan, Result, Result | InitPlan 2 (1), SubPlan 1 (1606) | 23,509 | 480,88 | 1606 |
| F3 (içada) | Index Scan, Seq Scan, Result, Result | InitPlan 2 (1), InitPlan 1 (1), InitPlan 3 (1) | 1,272 | 85,03 | 1606 |

`controle_negativo = 0` (sem identidade, a policy devolve zero linhas); `papel_na_medicao = authenticated`;
PG 17.6. Comparável com a F59 (16/09): F0 0,677 ms. O que importa para a F62: o piso continua sendo **UMA**
avaliação de `papel_atual()` por statement (`InitPlan 1`, 1 loop) — a F62 muda o que a função LÊ
(`membros` em vez de `profiles`), e o "depois" tem de manter a mesma forma.

Amostras F0 (exec, ms): 0.635, 0.628, 0.628, 0.624, 0.637, 0.624, 0.600, 0.603, 0.599.

## Produção (o canal de leitura existe — o mesmo bloco com `v_alvo = 'producao'`, só leitura)

| forma | nós | subplanos (loops) | exec mediana (ms, N=9) | custo | linhas |
|---|---|---|---|---|---|
| **F0** | Seq Scan, Result | **InitPlan 1 (1)** | **1,717** | 123,57 | 1649 |
| F1 | Seq Scan, Result | InitPlan 1 (1) | 47,914 | 531,32 | 1649 |
| F2 | Seq Scan, Result, Result | InitPlan 2 (1), SubPlan 1 (1649) | 52,393 | 547,63 | 1649 |
| F3 | Seq Scan, Seq Scan, Result, Result | InitPlan 2 (1), InitPlan 1 (1), InitPlan 3 (1) | 2,545 | 146,78 | 1649 |

Amostras F0 (exec, ms): 1.362, 1.424, 1.531, 1.717, 2.114, 1.645, 1.831, 2.006, 1.960. `controle_negativo = 0`.
Comparável com a F59 (16/09): F0 1,619 ms.
