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
| F7 | `F7-import-csv-ativos.md` → `F7-ultracode.md` | ✅ **CONCLUÍDA em 16/07/2026** (via `F7-ultracode.md`: W1 motor ∥ W2 banco → W3 tela → revisão adversarial de 7 dimensões, TOCTOU corrigido) e **em produção — gate resolvido, confirmado em 17/07/2026** (`import_logs` + RPC `importar_ativos_substituir` no ar; o gate era o classificador do modo automático, que barra a *execução* do import destrutivo). Tela `admin/importar`, só modo Substituir tudo (go-live por filial; Atualizar adiado); **revoga a regra "não existe importação" da spec §10** (docs emendados — §10.2). Migrations 0031/0032. Decisões em `docs/DECISOES.md` (2026-07-16 · F7) |
| F7B | `F7B-correcao-erros-import.md` → `F7B-ultracode.md` | ✅ **CONCLUÍDA em 17/07/2026** (via `F7B-ultracode.md`: W1 motor ∥ W2 banco → W3 validators+actions+UI → revisão adversarial + E2E em DEV + emendas). Erros e avisos do import se corrigem **no passo Preview**, não no CSV: agrupados por valor e corrigidos **em massa** (categoria/estado/site desconhecido/data, com sugestão por Levenshtein próprio), pontuais com o contexto da linha (patrimônio/service tag/colaborador), remoção de linha, painel com **Desfazer** e reanálise automática. CSV original imutável; correções auditadas em `import_logs.correcoes` (migration 0033 — coluna + RPC com `p_correcoes`). Régua da F7 intacta (descartado bloqueia; site de outra filial conhecida só remove). Decisões em `docs/DECISOES.md` (2026-07-17 · F7B) |
| F7E | `F7E-melhorias-import.md` → `F7E-ultracode.md` | ✅ **CONCLUÍDA em 17/07/2026 · em produção** (via `F7E-ultracode.md`: W1 motor ∥ W2 banco → integração → W3 UI/actions ∥ W4 pendência fora do import → revisão adversarial de 5 dimensões **0 defeitos** + E2E em DEV). Datas de entrega `dd/MMM` (puxam o ano da inclusão, +1 na virada) datam o **ajuste**; **patrimônio vazio** importa NULO com pendência `'sem patrimônio físico'` (lista + `/pendencias`, bucket que acolhe os "não canônico" do go-live; corrige na ficha); erros do mesmo tipo num **card só** com sugestão 1-clique do hostname. Migration `0034` (patrimônio nullable + índice parcial + RPC com pendência/data-do-ajuste/agregada). Só-números seguem bloqueantes; invariantes F7/F7B intactas. `0034` aplicada em produção pelo Johnny (SQL Editor — gate destrutivo da F7/F7B), conferida antes do merge (`78452d9`), deploy READY, smoke só-leitura OK. Decisões e ata em `docs/DECISOES.md` (2026-07-17 · F7E) |
