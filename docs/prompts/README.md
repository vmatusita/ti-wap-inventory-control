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
| F3B | `F3B-relatorios-v2.md` | Relatório no formato do e-mail (3 grupos + tabelas de saídas/entradas) + itens por quantidade + anotações (plano: `docs/PLANO-RELATORIOS-V2.md`) |
| F4 | `F4-importador-golive.md` | Carga inicial ÚNICA via scripts + ensaio + go-live/cutover (sem tela de importação) |
| F5 | `F5-refino.md` | Backlog de ordens curtas (acessórios, alertas, backup…) |
| F6A | `F6A-correcoes-pos-golive.md` | ✅ **CONCLUÍDA em 16/07/2026** (via `F6A-ultracode.md`, orquestração multi-agente A1 ∥ A4 ∥ A5 → integração → rollout único → auditoria A2). Migrations 0027 (Total/Estoque + `retorno`) e 0028 (v_pendencias detalhe) em produção; carga go-live filtrada do relatório; pendências só p/ operador + página `/pendencias`. Decisões em `docs/DECISOES.md` (2026-07-16 · F6A). Pendência devolvida ao Johnny: 2 snapshots congelados do go-live com a carga |
| F6B | `F6B-melhorias-ux.md` | ✅ **CONCLUÍDA em 16/07/2026** (via `F6B-ultracode.md`, orquestração em 2 ondas em worktrees isolados: W1 semana+resumo ∥ W2 obs+tabela de itens ∥ W3 termo+patrimônio ∥ W4 sessões → integração + revisão adversarial → B1 loading ∥ B9 ajuda → revisão adversarial → migration 0030 → deploy único). Loading nativo (barra + skeletons), semana default dom–sáb, quebra no resumo, obs no snapshot, seção de itens no relatório, confirmar/desfazer assinatura, corrigir patrimônio, sessões 24h, `/ajuda`. Zero dependência nova. Decisões em `docs/DECISOES.md` (2026-07-16 · F6B) |
| F6C | `F6C-carga-saldos-itens.md` | Carga única dos saldos iniciais de itens (pendência da F4) — **por último**, quando o export da planilha de gestão existir (decisão do Johnny: melhorias primeiro, cargas depois) |
| F7 | `F7-import-csv-ativos.md` → `F7-ultracode.md` | 🟡 **CONSTRUÍDA, REVISADA E DOCUMENTADA na `main` em 16/07/2026** (via `F7-ultracode.md`: W1 motor ∥ W2 banco → W3 tela → revisão adversarial de 7 dimensões, TOCTOU corrigido). Tela `admin/importar`, só modo Substituir tudo (go-live por filial; Atualizar adiado); **revoga a regra "não existe importação" da spec §10** (docs emendados — §10.2). Migrations 0031/0032 escritas; 0031 + RPC no DEV. **Pendente:** o classificador bloqueia a *execução* do import destrutivo — smoke no DEV + deploy em produção aguardam o aval do Johnny. Decisões em `docs/DECISOES.md` (2026-07-16 · F7) |
