# Contagens e planos — F53 (saída real)

## Contagens ANTES (capturadas antes de qualquer DDL)
```json
{
  "prod": {
    "contagens": {
      "total": 3497,
      "ativos": 1620,
      "primeira_data": "2024-01-08",
      "ultima_data": "2026-09-08",
      "ajustes": 1492,
      "estornos": 7
    },
    "impressao": {
      "impressao_ordem": "fe8138445f2b257aaeee27ad49dadf36",
      "impressao_conteudo": "c755546f01a8982fa3ca99fc5b135a10"
    }
  },
  "ensaio": {
    "contagens": {
      "total": 3239,
      "ativos": 1600,
      "primeira_data": "2024-01-08",
      "ultima_data": "2026-08-29",
      "ajustes": 1140,
      "estornos": 0
    },
    "impressao": {
      "impressao_ordem": "8fb5328f5010a3967185e7fadf672931",
      "impressao_conteudo": "7bf579e3381f0d01023e712c80a44b47"
    }
  }
}
```

## Contagens DEPOIS (as três migrations aplicadas)
```json
[
  {
    "ambiente": "prod",
    "total": 3503,
    "com_ordem": 3503,
    "faixa": "1..3547",
    "impressao_ordem": "8dda0f10884785157f88ec18920ee093",
    "impressao_conteudo": "ec3215d0ffa50d19dc27d46e223f6002"
  }
]
```

⚠ As contagens DEPOIS crescem com o uso real (operadores trabalhando). O que prova o critério 2
é a comparação feita IMEDIATAMENTE após o apply, registrada no RELATORIO-F53.md §4.1:
3497 = 3497, e os dois md5 idênticos aos de ANTES.

## EXPLAIN — a lista, DEPOIS da 0135 (Index Scan puro, sem nó de Sort)
```
Limit  (cost=0.28..3.54 rows=30 width=384) (actual time=0.036..0.073 rows=30 loops=1)
  Buffers: shared hit=8
  ->  Index Scan using movimentacoes_data_ordem_idx on movimentacoes  (cost=0.28..380.16 rows=3497 width=384) (actual time=0.035..0.067 rows=30 loops=1)
        Buffers: shared hit=8
Planning:
  Buffers: shared hit=422
Planning Time: 16.733 ms
Execution Time: 0.476 ms
```

## EXPLAIN — a linha do tempo (não regrediu: já pagava Sort antes da F53)
```
Sort  (cost=146.55..146.55 rows=2 width=384) (actual time=22.917..22.921 rows=8 loops=1)
  Sort Key: movimentacoes.created_at DESC, movimentacoes.ordem DESC
  Sort Method: quicksort  Memory: 27kB
  Buffers: shared hit=39
  InitPlan 1
    ->  Limit  (cost=142.92..142.92 rows=1 width=24) (actual time=22.730..22.731 rows=1 loops=1)
          Buffers: shared hit=25
          ->  Sort  (cost=142.92..146.97 rows=1620 width=24) (actual time=22.728..22.729 rows=1 loops=1)
                Sort Key: (count(*)) DESC
                Sort Method: top-N heapsort  Memory: 25kB
                Buffers: shared hit=25
                ->  GroupAggregate  (cost=0.28..134.82 rows=1620 width=24) (actual time=3.396..22.303 rows=1620 loops=1)
                      Group Key: movimentacoes_1.ativo_id
                      Buffers: shared hit=25
                      ->  Index Only Scan using mov_ativo_idx on movimentacoes movimentacoes_1  (cost=0.28..101.14 rows=3497 width=16) (actual time=3.384..20.879 rows=3503 loops=1)
                            Heap Fetches: 6
                            Buffers: shared hit=25
  ->  Index Scan using mov_ativo_idx on movimentacoes  (cost=0.28..3.61 rows=2 width=384) (actual time=22.774..22.835 rows=8 loops=1)
        Index Cond: (ativo_id = (InitPlan 1).col1)
        Buffers: shared hit=33
Planning:
  Buffers: shared hit=426
Planning Time: 1.804 ms
Execution Time: 23.285 ms
```
