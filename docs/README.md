# Índice da documentação

Este diretório tem 60+ arquivos, e a maior parte é **histórico**. Esta página existe para você não abrir o arquivo errado.

## Comece pelo que você precisa fazer

| Se você quer… | Leia |
|---|---|
| Entender o problema e o modelo de dados | [`ESPECIFICACAO.md`](ESPECIFICACAO.md) — §4 máquina de estados, §5 vocabulários De→Para, §6 telas, §7 relatórios, §8 regras |
| Entender o código que já existe | [`ARQUITETURA.md`](ARQUITETURA.md) — sobretudo §10, *"quero mudar X → mexo em Y"* |
| Trabalhar aqui pela primeira vez | [`ONBOARDING.md`](ONBOARDING.md) |
| Aplicar uma migration ou mexer no banco | [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md) |
| Saber por que algo foi decidido assim | [`DECISOES.md`](DECISOES.md) — atas em ordem cronológica, append-only |
| Achar onde mora uma regra de negócio | [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md) — cada regra com localização e prova |
| Saber quem pode fazer o quê | [`ADR-002-papeis-e-permissoes.md`](ADR-002-papeis-e-permissoes.md) e [`ADR-001-rls-por-filial.md`](ADR-001-rls-por-filial.md) |
| Executar a próxima fase | [`prompts/README.md`](prompts/README.md), depois a ordem `F*` correspondente |
| Saber o que está torto e ainda não foi consertado | [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md) e [`BACKLOG-UX.md`](BACKLOG-UX.md) |

Fora deste diretório: [`../CLAUDE.md`](../CLAUDE.md) (regras permanentes do agente), [`../CHANGELOG.md`](../CHANGELOG.md) (o que mudou, fase a fase) e `src/lib/ajuda/` (a documentação do **operador**, publicada em `/ajuda`).

## Hierarquia de autoridade

Quando código, ordem de serviço e documento se contradisserem, resolva **nesta ordem** — e registre a decisão em [`DECISOES.md`](DECISOES.md):

1. [`ESPECIFICACAO.md`](ESPECIFICACAO.md) — **o quê** construir
2. [`PLANEJAMENTO.md`](PLANEJAMENTO.md) — **como e quando**: stack fechada (§2), estratégia de dados (§3), fases (§4), definição de pronto (§6)
3. `../supabase/migrations/` — **fonte da verdade do banco** desde a F1

## Documentos vivos

Mantidos atualizados; espera-se que digam a verdade sobre o sistema de hoje.

| Documento | O que é |
|---|---|
| [`ESPECIFICACAO.md`](ESPECIFICACAO.md) | A especificação completa do produto |
| [`PLANEJAMENTO.md`](PLANEJAMENTO.md) | Stack, estratégia de dados, fases, definição de pronto |
| [`ARQUITETURA.md`](ARQUITETURA.md) | Modelo mental, camadas do código, onde mora cada regra |
| [`ONBOARDING.md`](ONBOARDING.md) | Do clone à primeira mudança em produção |
| [`RUNBOOK-BANCO.md`](RUNBOOK-BANCO.md) | Procedimento de migrations, o "gate", rollback, armadilhas — o anexo A é histórico |
| [`MATRIZ-REGRAS.md`](MATRIZ-REGRAS.md) | Matriz viva: cada regra de negócio, onde ela mora e o que a prova |
| [`DECISOES.md`](DECISOES.md) | Rastro de auditoria das decisões autônomas (append-only, nunca reescrito) |
| [`DIVIDA-TECNICA.md`](DIVIDA-TECNICA.md) | Diagnóstico priorizado do que está torto |
| [`BACKLOG-UX.md`](BACKLOG-UX.md) | Backlog de UX — fechado, exceto o que depende de decisão do Johnny |
| [`ADR-001-rls-por-filial.md`](ADR-001-rls-por-filial.md) · [`ADR-002-papeis-e-permissoes.md`](ADR-002-papeis-e-permissoes.md) | Decisões de arquitetura do modelo de acesso |
| [`prompts/`](prompts/) | As ordens de serviço, uma por fase (F0 → F40) |

## Planos de área

Escritos antes de construir um subsistema. Continuam úteis como **razão de desenho** — mas quem manda sobre o comportamento de hoje é a spec e o código.

| Documento | Subsistema |
|---|---|
| [`PLANO-TERMOS.md`](PLANO-TERMOS.md) | Termos de responsabilidade em `.docx` (F5A) |
| [`PLANO-RELATORIOS-V2.md`](PLANO-RELATORIOS-V2.md) | Relatórios ao vivo e snapshots |
| [`PLANO-AJUDA.md`](PLANO-AJUDA.md) | A documentação do operador em `/ajuda` (F20) |
| [`PLANO-DESIGN-SYSTEM.md`](PLANO-DESIGN-SYSTEM.md) | O sistema de design e o piloto em `/ativos` (F40) |
| [`PLANO-CORRECAO-TRUNCAMENTO-1000.md`](PLANO-CORRECAO-TRUNCAMENTO-1000.md) | O corte de 1.000 linhas nas leituras de estoque |
| [`PLANO-ITENS.md`](PLANO-ITENS.md) | O item passa a falar a língua do ativo — vocabulário único, cadastro passivo e o fim do bloqueio (F41/F42) |

## Exploração — ainda não é compromisso

Trabalho de projeto de sistema para uma direção que **ainda não foi decidida**: transformar o sistema num produto multiempresa e espelhar a planilha do SharePoint. Nada disso está construído.

`SYSTEM-DESIGN-ACERVO-2026-08-31.md` · `PLANO-PRODUTO-MULTIEMPRESA.md` · `PLANO-ESPELHO-SHAREPOINT.md` · `ROTEIRO-ESPELHO-ENTRA.md` · `prompt-produto-f0-fundacao.md`

## Histórico — leia para arqueologia, não para trabalhar

Estes arquivos descrevem o sistema **na data em que foram escritos**. Não os atualize: se o comportamento mudou, o lugar da verdade é a spec, a matriz de regras ou o CHANGELOG.

- **Relatórios de fase** — `RELATORIO-F11.md` → `RELATORIO-F42.md` (mais `F19-RELATORIO.md` e `RELATORIO-CORRECAO-TRUNCAMENTO-1000.md`): o que cada ordem entregou, com as evidências.
- **Planos de fase** — `PLAN-F30.md`, `PLAN-F31.md`, `PLAN-F32.md`, `PLAN-F33.md`, `PLAN-F35.md`, `PLAN-F36-F39.md`, `PLAN-F39.md`, `PLAN-F40.md`, `PLAN-F41.md`, `PLAN-F42.md`: o plano medido antes de executar a fase.
- **Análises datadas** — `ANALISE-PLANILHA-F4.md`, `ANALISE-UX-2026-08-07.md`, `ANALISE-RELATORIOS-2026-08-10.md`, `SYSTEM-DESIGN-2026-08-30.md`, `E2E-F10.md`.
- **Evidências** — `f19-evidencias/` (capturas de tela do modo escuro), `f39-evidencias/` (os 5 modelos `.docx` renderizados para conferência visual), `perf/` (medições de TTFB em JSON, F33 e F37).

## Regras para quem escreve documentação aqui

1. **Cada fato mora em um lugar só.** Se já está na spec, no CHANGELOG ou na matriz de regras, **link** — não copie. Cópia envelhece sem avisar.
2. **Documento datado não se atualiza.** Relatórios, análises e atas registram um momento. Corrigir o passado apaga a evidência; escreva a correção no documento vivo.
3. **Documento vivo não vira diário.** Se um procedimento acumulou histórico até enterrar o passo 1, o histórico vai para um anexo no fim — foi o que se fez com o `RUNBOOK-BANCO.md`.
4. **Toda entrada nova no CHANGELOG exige uma versão** (regra permanente, item 7 do `CLAUDE.md`): bump no `package.json`, entrada no `src/lib/versoes/registry.ts` em linguagem de operador, e tag anotada. Documentação interna de desenvolvedor — esta pasta, o README, o runbook — **não** entra no CHANGELOG: ela não muda nada para quem opera o sistema. O registro dela é a ata em [`DECISOES.md`](DECISOES.md).
