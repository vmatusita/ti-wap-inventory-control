# `medir-rls` DEPOIS da F62 — ENSAIO

- Quando: 22/09/2026, depois do apply das `0152`–`0158` no ensaio (SHA de código `f31175a`).
- Comando gerado: `node scripts/perf/medir-rls.mjs gerar --alvo ensaio --ref sgmvldiizsrjbxzzpmhh --canal mcp --dir <scratchpad>`
  — o gerador da F62, que já escolhe a identidade pela MEMBERSHIP (`membros` × `profiles`, empresa legada);
  executado `ensaio-ativos-admin.sql` pelo MCP (`execute_sql`), transação só-leitura que termina em exceção.
- Identidade: escolhida DENTRO do banco (primeiro perfil admin/dev ativo por id) — o id não saiu.

| forma | nós | subplanos (loops) | exec mediana (ms, N=9) | custo | linhas | ANTES (mediana · custo) |
|---|---|---|---|---|---|---|
| **F0** (o piso de hoje) | Seq Scan, Result | **InitPlan 1 (1)** | **0,712** | 63,32 | 1606 | 0,624 · 63,32 |
| F1 (por linha) | Seq Scan, Result | InitPlan 1 (1) | 54,486 | 464,82 | 1606 | 22,458 · 464,82 |
| F2 (falso içamento) | Seq Scan, Result, Result | InitPlan 2 (1), SubPlan 1 (1606) | 55,730 | 480,88 | 1606 | 23,509 · 480,88 |
| F3 (içada) | Index Scan, Seq Scan, Result, Result | InitPlan 2 (1), InitPlan 1 (1), InitPlan 3 (1) | 1,656 | 85,29 | 1606 | 1,272 · 85,03 |

`controle_negativo = 0`; `papel_na_medicao = authenticated`; `esperado_f1_f3 = 1606`; PG 17.6.

Amostras F0 (exec, ms): 0.764, 0.729, 0.737, 0.701, 0.711, 0.711, 0.712, 0.694, 0.726.

**O que a medição diz.**

- **O piso mantém a FORMA** — `InitPlan 1` com 1 loop: `papel_atual()` segue avaliada UMA vez por statement, e o
  custo estimado é o mesmo (63,32). A mediana subiu **0,09 ms** (0,624 → 0,712): a ponte lê `membros` e junta
  `profiles`, e a avaliação única custa um pouco mais.
- **A forma POR LINHA ficou 2,4× mais cara** (F1 22,5 → 54,5 ms em 1606 linhas; ~14 → ~34 µs por linha): cada
  chamada de `pode_escrever_filial()` reavalia `papel_atual()`, e a ponte agora é um join. Nenhuma policy de LEITURA
  usa essa forma; as de ESCRITA com `pode_escrever_filial(filial_id)` sim (as exceções R1 declaradas na F59, até a
  F66), e pagam isso por linha ESCRITA — num lote de movimentação de dezenas de itens, décimos de milissegundo. A
  forma içada (F3), que a F66 põe no lugar, continua perto da F0 (1,66 ms). **Declarado no relatório**, não escondido.
