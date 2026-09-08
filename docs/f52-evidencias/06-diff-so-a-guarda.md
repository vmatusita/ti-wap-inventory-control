# F52 — O diff das quatro funções recriadas: só a guarda nova

A régua do passo 3 do caminho B do `RUNBOOK-BANCO.md`: *"o diff da nova migration vs a
anterior deve ser **só a mudança pretendida**. Qualquer outra diferença é bug."*

Isto não foi conferido depois — foi **construído assim**. Os quatro corpos da `0132` não
foram escritos à mão: são o corpo **vigente** resolvido por `scripts/db/corpo-vigente.mjs`
a partir das migrations, e transformado por `trocarNoCorpo` — a mesma função que o injetor
usa. Se uma âncora não existisse, ou existisse duas vezes, ela teria reprovado alto em vez
de produzir uma recriação silenciosamente errada.

## `exigir_gestao_de` — 0 linha(s) removida(s), 16 acrescentada(s)

**Adição pura.** Nenhuma linha do corpo anterior mudou.

## `importar_ativos_substituir` — 0 linha(s) removida(s), 21 acrescentada(s)

**Adição pura.** Nenhuma linha do corpo anterior mudou.

## `apagar_ativos_conflito_filiais` — 0 linha(s) removida(s), 15 acrescentada(s)

**Adição pura.** Nenhuma linha do corpo anterior mudou.

## `import_validar_plano` — 2 linha(s) removida(s), 67 acrescentada(s)

As linhas removidas, uma a uma:

```diff
-   -- ---------- 1b. backup obrigatório ----------
-     raise exception 'Import destrutivo exige backup_path (o acervo da filial deve ser exportado antes).';
```

