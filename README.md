# Controle de Estoque TI — WAP

Sistema interno para substituir o controle de ativos de TI feito hoje em três planilhas desconectadas (inventário, saída e devolução) + revisão por Gmail + relatório semanal manual por filial.

**Ideia central:** registra-se só a *movimentação* (saída, devolução, compra, transferência…) uma única vez; o estado do ativo, o estoque e os relatórios por filial derivam automaticamente. Relatório deixa de ser enviado — vira um link sempre atualizado.

## Stack (decidida em 09/07/2026)

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **Tailwind CSS** + **shadcn/ui** + Recharts v3 (análise de alternativas no PLANEJAMENTO §2.1)
- **Supabase** (plano Free) — Postgres, Auth (login por convite), RLS, Realtime
- Deploy: **Vercel** (conta Pro já paga — custo novo R$ 0 para a empresa)

**Regra de patrimônio:** o patrimônio identifica o equipamento, mas repete em casos raros — quem é único é o par **patrimônio + service tag** (spec §5, regra 1).

**Modelo de acesso:** operar = login com conta WAP (só `@wap.ind.br`, nível único — todo logado é admin); visualizar relatórios = **senha de acesso, sem conta** (senhas com rótulo, criadas e revogadas individualmente pelo admin) — spec §3.

## Estrutura deste repositório

| Caminho | Conteúdo |
|---|---|
| `CLAUDE.md` | Regras permanentes para o Claude Code (lido automaticamente em toda sessão): modo autônomo, stack travada, convenções, estrutura prescrita, dados fictícios, custo zero |
| `docs/ESPECIFICACAO.md` | **O quê** — especificação completa: problema, conceito, modelo de dados, telas, regras, fases e perguntas em aberto |
| `docs/PLANEJAMENTO.md` | **Como e quando** — stack fechada, estratégia de dados, fases com critérios e o fluxo de execução via Claude Code (§9) |
| `docs/prompts/` | **Ordens de serviço F0–F5** — um prompt detalhado por fase, pronto para colar no Claude Code (leia `docs/prompts/README.md` antes) |
| `docs/DECISOES.md` | Rastro de auditoria das decisões autônomas |
| `supabase/migrations/` | Fonte da verdade do banco a partir da F1 (`schema.sql` é histórico) |
| `mockups/dashboard-relatorio.html` | Mockup navegável do relatório por filial, com os números reais das planilhas de 2026 |

## Status

- [x] Análise das planilhas reais (1.179 ativos, 423 saídas, 291 devoluções — jan–jul/2026) e dos e-mails semanais
- [x] Decisões de arquitetura confirmadas
- [x] Especificação v1.1
- [x] Planejamento de desenvolvimento (stack fechada, fases F0–F5, estratégia de dados)
- [x] Ordens de serviço para o Claude Code (`CLAUDE.md` + `docs/prompts/F0–F5`)
- [x] Planejamento validado → execução autônoma iniciada
- [x] **F0 — fundação** — concluída em 10/07/2026 (Next 16.2.10, login por convite restrito a `@wap.ind.br`, layout, sessão via proxy, deploy)
- [x] **F1 — banco + dados fictícios** — concluída em 10/07/2026 (migrations 0001–0007 incl. `senhas_acesso`, seed determinístico com guardas anti-produção, tipos gerados, roteiro SQL de teste da máquina de estados)
- [x] **F2 — operação** — concluída em 10/07/2026 (lista com filtros/busca server-side + data-table, ficha com linha do tempo, nova movimentação em lote com validações Zod espelhando a máquina de estados, estorno da última movimentação, facilitadores anti-Excel: atalho `N`, "repetir última", "duplicar", data default, foco na busca)
- [ ] F3 — relatórios (ao vivo + snapshot semanal gerado + acesso por senha) + administração
- [ ] F4 — carga inicial única via scripts + go-live (cutover em __/__/____)
- [ ] F5 — refino (acessórios por quantidade, alertas, e-mail, termos)

Pendências não bloqueantes: perguntas 1, 4, 5, 6 e 7 da spec §13 (a nº 1 — filiais oficiais — precisa de resposta até a F4).

## Próximo passo

**F3 — Relatórios + administração.** Abra o Claude Code na raiz deste repositório e cole `docs/prompts/F3-relatorios.md`. Fluxo completo em `docs/prompts/README.md`.

As ordens rodam em **modo autônomo com acesso total** (decisão de 09/07/2026, regras no `CLAUDE.md`): o Claude executa tudo — decisões, merge, deploy e produção — sem pedir autorização, compensando com autoproteções (backup/dry-run em operação destrutiva) e rastro auditável em `docs/DECISOES.md`.

Importante: o sistema **não nasce com os dados reais**. O desenvolvimento roda com dados fictícios; os dados reais entram por uma **carga única via scripts no go-live** (F4), executada de forma autônoma na janela do go-live. Depois disso **não existe importação** — a entrada de dados é 100% manual pelo sistema, e ser mais prático que o Excel é o requisito central (facilitadores da F2).
