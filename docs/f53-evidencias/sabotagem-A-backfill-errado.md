# Sabotagem A — o backfill errado tem de ficar VERMELHO

**Pergunta:** se o backfill esquecer `(tipo = 'ajuste')` no `order by`, a asserção de
equivalência acusa?

## Primeira tentativa — e o achado que ela produziu

A ordem sugeria criar uma coluna paralela com o backfill errado dentro de `begin; … rollback;`.
Foi o que se fez, **contra o ensaio** (`scratchpad/f53/sabotagem-A.sql`):

```json
[ { "divergentes_da_sabotada": 0, "universo": 3239 } ]
```

**Verde.** E, pela própria ordem, *"se ele ficar VERDE, isso é o achado"*. É.

## O diagnóstico

A cláusula `(tipo = 'ajuste')` só decide alguma coisa quando duas movimentações do **mesmo
ativo** compartilham `(data, created_at)` e **diferem** em ser ou não ajuste. Medido, como
leitura pura (sem DDL nenhum — estritamente melhor que a coluna paralela, e prova o mesmo):

```sql
select
  (select count(*) from (select row_number() over (order by data, created_at, (tipo='ajuste'), id) as certa,
                                row_number() over (order by data, created_at, id) as errada
                           from public.movimentacoes) t where t.certa is distinct from t.errada) as divergentes_sem_a_clausula,
  (select count(*) from public.movimentacoes) as universo,
  (select count(*) from public.movimentacoes a
     where exists (select 1 from public.movimentacoes b
                    where b.ativo_id=a.ativo_id and b.id<>a.id
                      and b.data=a.data and b.created_at=a.created_at
                      and (b.tipo='ajuste') is distinct from (a.tipo='ajuste'))) as linhas_em_empate_compra_x_ajuste;
```

| Ambiente | `divergentes_sem_a_clausula` | `universo` | `linhas_em_empate_compra_x_ajuste` |
|---|---|---|---|
| **produção** | **2429** | 3497 | **2540** |
| **ensaio** | **0** | 3239 | **0** |

## O resultado

- **Em produção a sabotagem MORDE**: tirar a cláusula muda a `ordem` de **2429 das 3497 linhas**
  (69,5%), e a asserção de equivalência total (`3b`) fica vermelha. A sabotagem está provada.
- **No ensaio ela não morde — porque o ensaio não tem o cenário.** Zero linhas em empate
  compra × ajuste. O ensaio nunca recebeu um import de startup com `dataEntrada = dataAjuste`.

## O que isto obriga a declarar

**O ensaio é rehearsal de MECÂNICA, não de SEMÂNTICA.** Ele prova que a `0133` e a `0134`
aplicam sem erro, que a coluna fecha com a forma certa e que a sequência fica à frente. Ele
**não** prova nada sobre o desempate compra × ajuste, porque o dado que produz esse empate não
existe lá. Quem responde por isso é (a) a comparação das 12 datas **em produção** e (b) o
cenário `3a` do roteiro, que **constrói** o empate com `created_at` literal em vez de esperar
encontrá-lo — e é por isso que ele funciona também no banco vazio do CI.
