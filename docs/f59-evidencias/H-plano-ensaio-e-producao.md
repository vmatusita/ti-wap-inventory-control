# H — o plano mostra a doutrina (ensaio e produção, só leitura, como authenticated com a RLS no plano)

Ensaio: MCP da Supabase (execute_sql), bloco do … raise exception; sha 96a6827 (os comandos gerados em b720f49 são byte a byte os executados).
Produção: MCP da Supabase (execute_sql), bloco do … raise exception; sha b720f49 — o SHA de código congelado.
Método (os dois): explain (analyze, buffers, verbose, format json), 1 aquecimento por forma, N=9 repetições intercaladas F0→F3; como authenticated com request.jwt.claims da identidade escolhida no banco; transaction_read_only = on; o bloco termina em raise exception; mediana e p95 por posto mais próximo (com N=9 o p95 é a maior amostra); buffers do nó raiz.

| alvo | tabela | forma | nós do plano | subplanos (loops) | função no Filter de | Filter por SubPlan | piso RLS no plano | linhas = esperadas | exec mediana · p95 (ms) | custo |
|---|---|---|---|---|---|---|---|---|---|---|
| ensaio | ativos | F0 | Seq Scan, Result | InitPlan 1 (1) | — | não | sim | 1606 = 1606: true | 0.677 · 0.817 | 64.28 |
| ensaio | ativos | F1 | Seq Scan, Result | InitPlan 1 (1) | ativos | não | sim | 1606 = 1606: true | 23.324 · 24.458 | 464.78 |
| ensaio | ativos | F2 | Seq Scan, Result, Result | InitPlan 2 (1), SubPlan 1 (1606) | — | sim | sim | 1606 = 1606: true | 24.294 · 25.763 | 480.8 |
| ensaio | ativos | F3 | Index Scan, Seq Scan, Result, Result | InitPlan 2 (1), InitPlan 1 (1), InitPlan 3 (1) | filiais | não | sim | 1606 = 1606: true | 1.342 · 1.389 | 86.01 |
| ensaio | movimentacoes | F0 | Seq Scan, Result | InitPlan 1 (1) | — | não | sim | 3245 = 3245: true | 1.117 · 1.169 | 292.65 |
| ensaio | movimentacoes | F1 | Seq Scan, Result | InitPlan 1 (1) | movimentacoes | não | sim | 3245 = 3245: true | 45.219 · 45.457 | 1102.4 |
| ensaio | movimentacoes | F2 | Seq Scan, Result, Result | InitPlan 2 (1), SubPlan 1 (3245) | — | sim | sim | 3245 = 3245: true | 47.46 · 48.062 | 1134.79 |
| ensaio | movimentacoes | F3 | Seq Scan, Seq Scan, Result, Result | InitPlan 2 (1), InitPlan 1 (1), InitPlan 3 (1) | filiais | não | sim | 3245 = 3245: true | 1.663 · 1.693 | 335.7 |
| produção | ativos | F0 | Seq Scan, Result | InitPlan 1 (1) | — | não | sim | 1620 = 1620: true | 1.619 · 2.868 | 130.36 |
| produção | ativos | F1 | Seq Scan, Result | InitPlan 1 (1) | ativos | não | sim | 1620 = 1620: true | 43.55 · 47.177 | 707.86 |
| produção | ativos | F2 | Seq Scan, Result, Result | InitPlan 2 (1), SubPlan 1 (1620) | — | sim | sim | 1620 = 1620: true | 45.01 · 49.366 | 730.96 |
| produção | ativos | F3 | Seq Scan, Seq Scan, Result, Result | InitPlan 2 (1), InitPlan 1 (1), InitPlan 3 (1) | filiais | não | sim | 1620 = 1620: true | 2.132 · 2.527 | 162.06 |
| produção | movimentacoes | F0 | Seq Scan, Result | InitPlan 1 (1) | — | não | sim | 3555 = 3555: true | 1.921 · 2.717 | 318.23 |
| produção | movimentacoes | F1 | Seq Scan, Result | InitPlan 1 (1) | movimentacoes | não | sim | 3555 = 3555: true | 87.7 · 92.243 | 1192.48 |
| produção | movimentacoes | F2 | Seq Scan, Result, Result | InitPlan 2 (1), SubPlan 1 (3555) | — | sim | sim | 3555 = 3555: true | 94.223 · 102.406 | 1227.45 |
| produção | movimentacoes | F3 | Seq Scan, Seq Scan, Result, Result | InitPlan 2 (1), InitPlan 1 (1), InitPlan 3 (1) | filiais | não | sim | 3555 = 3555: true | 2.742 · 3.333 | 364.76 |

A RLS vale (controle negativo: claims sem sub → 0 linhas; papel_atual no Output do plano em todas as formas):
- ensaio · ativos · admin: papel authenticated, controle negativo 0 linhas, piso em todas as formas true → vale true
- ensaio · movimentacoes · admin: papel authenticated, controle negativo 0 linhas, piso em todas as formas true → vale true
- produção · ativos · admin: papel authenticated, controle negativo 0 linhas, piso em todas as formas true → vale true
- produção · movimentacoes · admin: papel authenticated, controle negativo 0 linhas, piso em todas as formas true → vale true

Pendências declaradas:
- ensaio · ativos · operador: F59_IDENTIDADE_AUSENTE identidade=operador alvo=ensaio
- ensaio · movimentacoes · operador: F59_IDENTIDADE_AUSENTE identidade=operador alvo=ensaio
- produção: nenhuma (produção mede só a identidade de nível administrador, por desenho — a persona operador é do ensaio, e fictícia)

Leitura: F1 tem a função no Filter da própria tabela (uma chamada por linha); F2 tem SubPlan com um loop por linha
(o falso içamento); F3 tem só InitPlan com 1 loop e a função filtra filiais, não a tabela medida. F0 é o piso de hoje.
