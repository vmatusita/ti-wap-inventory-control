# Ordens de serviço — como usar

Cada arquivo `F*.md` desta pasta é um prompt completo para uma fase, escrito para ser **colado inteiro no Claude Code**, aberto na raiz deste repositório.

## Fluxo de cada fase

1. Confira no `README.md` que a fase anterior está fechada (checklist de aceite passou).
2. Abra o Claude Code na raiz do repositório (`claude` no terminal). Ele lê o `CLAUDE.md` automaticamente — as regras de lá valem sempre.
3. Cole o conteúdo inteiro do `F<N>-*.md` da fase.
4. Acompanhe: o prompt manda o Claude Code **parar e perguntar** diante de qualquer ambiguidade — responda e deixe seguir.
5. Ao final, ele entrega um resumo com o checklist de aceite preenchido. **Você confere item por item** (os passos de teste manual estão no próprio prompt). Só então faça o merge do branch da fase na `main` e marque a fase no `README.md`.

## Regras de ouro

- **Uma ordem por vez.** Não cole duas fases na mesma sessão.
- Se o repositório mudou desde que o prompt foi escrito (ex.: você mexeu em algo à mão), me peça para atualizar a ordem antes de rodar — prompt desatualizado gera obra torta.
- Prompt bom não dispensa fiscal: o critério de aceite é seu, não do Claude Code.
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
