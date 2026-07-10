# Ordens de serviço — como usar

Cada arquivo `F*.md` desta pasta é um prompt completo para uma fase, escrito para ser **colado inteiro no Claude Code**, aberto na raiz deste repositório.

## Fluxo de cada fase

1. Confira no `README.md` que a fase anterior está fechada (checklist de aceite passou).
2. Abra o Claude Code na raiz do repositório (`claude` no terminal). Ele lê o `CLAUDE.md` automaticamente — as regras de lá valem sempre.
3. Cole o conteúdo inteiro do `F<N>-*.md` da fase.
4. **Modo autônomo (CLAUDE.md):** ele decide sozinho (registrando em `docs/DECISOES.md`), executa de ponta a ponta — decisões, merge, deploy e produção inclusos — e se autoverifica pelo checklist da ordem. Só te procura se faltar um insumo físico seu (ex.: os CSVs reais).
5. Ao final, ele entrega o resumo com checklist marcado, decisões e pendências, e atualiza o `README.md`. Revise quando quiser — nada fica bloqueado esperando você.

## Regras de ouro

- **Uma ordem por vez.** Não cole duas fases na mesma sessão.
- Se o repositório mudou desde que o prompt foi escrito (ex.: você mexeu em algo à mão), me peça para atualizar a ordem antes de rodar — prompt desatualizado gera obra torta.
- Modo autônomo não elimina auditoria: o resumo de cada fase + `docs/DECISOES.md` + o histórico do git são o seu rastro para revisar depois, no seu tempo.
- Custo R$ 0 e dados 100% fictícios até a F4 — se qualquer rodada pedir cartão de crédito ou dado real, algo está errado: pare.

## As fases

| Ordem | Arquivo | Resultado |
|---|---|---|
| F0 | `F0-fundacao.md` | Projeto Next 16 + Supabase + login por convite + deploy |
| F1 | `F1-banco-e-seed.md` | Migrations do schema + banco populado com dados fictícios |
| F2 | `F2-operacao.md` | Ativos, ficha com linha do tempo, nova movimentação em lote, estorno |
| F3 | `F3-relatorios.md` | Relatórios por filial em tempo real + telas de administração |
| F4 | `F4-importador-golive.md` | Carga inicial ÚNICA via scripts + ensaio + go-live/cutover (sem tela de importação) |
| F5 | `F5-refino.md` | Backlog de ordens curtas (acessórios, alertas, backup…) |
