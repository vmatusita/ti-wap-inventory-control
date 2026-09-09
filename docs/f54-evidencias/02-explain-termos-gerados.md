# As duas formas de ler `termos_gerados` — medidas, lado a lado

Medido em **09/09/2026**, no banco de **PRODUÇÃO** (`pbtjcalbmepmrqzprusb`), só leitura, via
`execute_sql` do MCP Supabase. É a evidência do critério 7 da ordem de serviço.

Estado da tabela no momento da medição: **91 linhas** em `termos_gerados`, **1.140 ativos** na
Matriz (`filial_id = 1`), que é o maior recorte real do sistema.

## Os índices que existem (medido antes de decidir — fato 13 da ordem)

```
termos_gerados_pkey                     UNIQUE btree (id)
termos_gerados_tipo_movimentacao_ids_key UNIQUE btree (tipo, movimentacao_ids)
termos_gerados_arquivo_path_idx         btree (arquivo_path)
termos_gerados_ativos_gin               gin (ativo_ids)      ← o que decide esta troca
termos_gerados_movs_gin                 gin (movimentacao_ids)
```

O GIN sobre `ativo_ids` **existe**. A ordem de serviço avisava (fato 13) que sem ele o `&&` faria
um seq scan **por lote** — treze varreduras no lugar de uma. Não é o caso, e o plano abaixo prova
que ele é de fato usado (`Bitmap Index Scan on termos_gerados_ativos_gin`).

## Forma A — a leitura de HOJE: a tabela inteira, filtrada em TypeScript

```sql
explain (analyze, buffers) select * from public.termos_gerados order by id;
```

```
Sort  (cost=11.77..11.99 rows=89 width=599) (actual time=0.966..0.975 rows=91 loops=1)
  Sort Key: id
  Sort Method: quicksort  Memory: 80kB
  Buffers: shared hit=11
  ->  Seq Scan on termos_gerados  (cost=0.00..8.89 rows=89 width=599) (actual time=0.592..0.854 rows=91 loops=1)
        Buffers: shared hit=8
Planning Time: 1.029 ms
Execution Time: 1.070 ms
```

**1 ida ao banco. 1,070 ms. 8 buffers.** Traz as 91 linhas — inclusive as das filiais que o
backup não toca.

## Forma B — o recorte no banco: `&&` por lote de 100 ids

```sql
explain (analyze, buffers) select * from public.termos_gerados
where ativo_ids && (select array_agg(id) from
        (select id from public.ativos where filial_id=1 order by id offset 200 limit 100) s);
```

```
Bitmap Heap Scan on termos_gerados  (cost=40.86..41.97 rows=1 width=599) (actual time=1.102..1.113 rows=10 loops=1)
  Recheck Cond: (ativo_ids && (InitPlan 1).col1)
  Heap Blocks: exact=6
  Buffers: shared hit=503
  ->  Bitmap Index Scan on termos_gerados_ativos_gin  (cost=0.00..4.11 rows=1 width=0) (actual time=1.093..1.093 rows=10 loops=1)
        Index Cond: (ativo_ids && (InitPlan 1).col1)
Planning Time: 1.442 ms
Execution Time: 1.259 ms
```

**1,259 ms por lote, com o índice GIN usado.**

⚠ A primeira execução deste mesmo plano deu **12,492 ms**, com `Bitmap Index Scan` em 10,7 ms:
era **cache frio** do índice GIN, não o custo real. Está registrado aqui porque medir uma vez só
teria produzido a conclusão errada ("o `&&` é 10× mais lento") — o número que vale é o de cache
quente, e ele só aparece na segunda medição.

## O total, e por que a troca não é por velocidade

A Matriz tem 1.140 ativos ⇒ **12 lotes** de 100.

| | idas ao banco | tempo de banco | linhas trazidas |
|---|---:|---:|---:|
| A — tabela inteira | **1** | **1,07 ms** | 91 (todas as filiais) |
| B — `&&` em lotes | **12** | ~15,1 ms (12 × 1,26) | só as do recorte |

**Hoje a forma A é mais rápida**, e isso está escrito no código para que a próxima pessoa decida
com o número e não contra ele. O que a forma B compra não é tempo:

- **Escopo.** O servidor deixa de trazer para a memória linha de filial que este backup não vai
  apagar. É a propriedade que a preparação multiempresa existe para comprar — na virada, "ler a
  tabela inteira" é ler o acervo de outra empresa.
- **Memória que cresce com o recorte, não com a tabela.** A forma A carrega `termos_gerados`
  inteira no processo do servidor, sempre.

**Onde as duas se cruzam:** a forma A pagina de 1.000 em 1.000; a forma B faz um lote a cada 100
ativos do recorte. Com a Matriz em 1.140 ativos (12 lotes), o cruzamento fica por volta de
**12.000 termos** — a partir daí a forma A passa a fazer mais idas ao banco *e* a trazer mais
linhas. Hoje há 91.

**O preço, em contexto:** `exportarAcervoFilial` já fazia ~24 idas ao banco antes desta leitura
(ativos paginado + 12 lotes de movimentações + 12 de anotações). O import é uma operação
deliberada, rara e medida em segundos, e sua fase mais cara é a RPC. +11 idas aqui é preço
declarado, não regressão descoberta depois.

## O que esta medição NÃO prova

- Foi medida com **91 linhas**. O comportamento com 12.000 é *extrapolado da forma do plano*
  (Bitmap Index Scan por lote × Seq Scan + paginação), não medido.
- Mede **tempo de banco**, não a latência de rede das 11 idas a mais entre a Vercel e o Supabase,
  que na prática domina — e que empurra a forma B para ainda mais longe no eixo do tempo.
- O `EXPLAIN` roda o `&&` com um sub-select; o código real manda os 100 uuids na URL (`ov.{…}`).
  O operador e o índice são os mesmos; o custo de montar a URL não está aqui.
