# F52 — Sabotagem C: a régua de normalização divergindo

**O que se sabota:** trocar `upper(btrim(coalesce(...)))` por igualdade exata dentro de
`import_validar_plano`, na `0132` — isto é, fazer o lado SQL divergir do lado TS.

**O que tem de acontecer:** o teste da gêmea (`import-confirmacao-sql.test.ts`) fica vermelho,
sem precisar de banco nenhum.

## A mutação

```diff
- if upper(btrim(coalesce(v_confirmacao, ''))) <> upper(btrim(coalesce(v_filial_nome, ''))) then
+ if v_confirmacao <> v_filial_nome then
```

## A saída real

```
 ❯ |puro| src/lib/validators/import-confirmacao-sql.test.ts (19 tests | 2 failed) 104ms
     × a expressão SQL usa a régua da CASA — upper(btrim(coalesce(...))) 26ms
     × a régua NÃO é igualdade exata — o afrouxamento é deliberado 21ms

AssertionError: expected '-- ==============…' to match /upper\(btrim\(coalesce\(v_confirmacao…/
     54|     expect(sql).toMatch(/upper\(btrim\(coalesce\(v_confirmacao, ''\)\)…
     55|     expect(sql).toMatch(/upper\(btrim\(coalesce\(v_filial_nome, ''\)\)…

AssertionError: expected '-- ==============…' not to match /v_confirmacao\s*<>\s*v_filial_nome/
     64|     expect(sql).not.toMatch(/v_confirmacao\s*<>\s*v_filial_nome/)

 Test Files  1 failed (1)
      Tests  2 failed | 17 passed (19)
```

## Depois do rollback da sabotagem

```
 Test Files  1 passed (1)
      Tests  19 passed (19)
```

**Por que as DUAS asserções importam, e não uma.** A primeira (`toMatch`) prova que a régua da
casa **está lá**; a segunda (`not.toMatch`) prova que a igualdade exata **não está**. Só a
primeira deixaria passar um corpo que tivesse as duas expressões — o que é exatamente a forma
que uma "correção" apressada tomaria ao acrescentar uma checagem sem remover a outra.
