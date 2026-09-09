# Roteiro de restauração — execução real contra o projeto de ENSAIO

Rodado em 09/09/2026 contra `sgmvldiizsrjbxzzpmhh` pela Management API, no molde que o
RUNBOOK-BANCO.md prescreve para esta mesa (sem Docker e sem psql local):
`_asserts.sql` + o roteiro na MESMA sessão, dentro de `begin; … rollback;`.

⚠ A Management API ENGOLE `NOTICE`/`WARNING` — o próprio runbook avisa. Por isso a
execução abaixo é de uma CÓPIA INSTRUMENTADA do roteiro, idêntica ao arquivo commitado
exceto por duas tabelas temporárias que devolvem o placar como LINHAS. O arquivo
commitado não tem instrumentação nenhuma: no CI quem lê os ✓/✗ é o `rodar-roteiros.sh`.

```
HTTP 201
[{"ok":13,"falhas":0,"ramos_que_falharam":"-"}]
```

## Os treze rótulos

- ✓ 1b o trigger criou 1 pendência de item (é ela que o cenário 3c duplica)
- ✓ 4a `ativos` entra primeiro, sem violar FK
- ✓ 2a sem `overriding system value` o INSERT é RECUSADO (generated always)
- ✓ 2b com `overriding system value`, a `ordem` do backup (%) foi preservada
- ✓ 3b com o trigger desligado, `ativos.status` NÃO foi reescrito pela reinserção
- ✓ 3a com o trigger LIGADO, `ativos.status` foi reescrito (em_estoque → em_uso) por cima do restaurado
- ✓ 3c com o trigger LIGADO a pendência DUPLICA (% linhas para 1 item) — é por isso que a Decisão 7 desliga o trigger
- ✓ 3d o estado derivado pela máquina (%) coincide com o do backup
- ✓ 2c sem `setval`, a PRIMEIRA movimentação depois da restauração viola o índice único de `ordem`
- ✓ 2d com `setval` para max(ordem), a movimentação seguinte entra sem colidir
- ✓ 5a fora da janela, `guarda_acervo` permite INSERT comum e RECUSA `forcado = true`
- ✓ 5b dentro da janela, a linha `forcado = true` do backup pode ser restaurada
