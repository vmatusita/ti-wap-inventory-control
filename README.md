# Controle de Estoque TI — WAP

Sistema interno para substituir o controle de ativos de TI feito hoje em três planilhas desconectadas (inventário, saída e devolução) + revisão por Gmail + relatório semanal manual por filial.

**Ideia central:** registra-se só a *movimentação* (saída, devolução, compra, transferência…) uma única vez; o estado do ativo, o estoque e os relatórios por filial derivam automaticamente. Relatório deixa de ser enviado — vira um link sempre atualizado.

## Stack (decidida em 09/07/2026)

- **Next.js 16** (App Router, Turbopack) + TypeScript
- **Tailwind CSS** + **shadcn/ui** + Recharts v3 (análise de alternativas no PLANEJAMENTO §2.1)
- **Supabase** (plano Free) — Postgres, Auth (login por convite), RLS, Realtime
- Deploy: **Vercel** (conta Pro já paga — custo novo R$ 0 para a empresa)

**Regra de patrimônio:** o patrimônio identifica o equipamento, mas repete em casos raros — quem é único é o par **patrimônio + service tag** (spec §5, regra 1).

## Estrutura deste repositório

| Caminho | Conteúdo |
|---|---|
| `CLAUDE.md` | Regras permanentes para o Claude Code (lido automaticamente em toda sessão): stack travada, convenções, estrutura prescrita, dados fictícios, custo zero |
| `docs/ESPECIFICACAO.md` | **O quê** — especificação completa: problema, conceito, modelo de dados, telas, regras, fases e perguntas em aberto |
| `docs/PLANEJAMENTO.md` | **Como e quando** — stack fechada, estratégia de dados, fases com critérios e o fluxo de execução via Claude Code (§9) |
| `docs/prompts/` | **Ordens de serviço F0–F5** — um prompt detalhado por fase, pronto para colar no Claude Code (leia `docs/prompts/README.md` antes) |
| `supabase/schema.sql` | Rascunho do banco (enums, tabelas, trigger da máquina de estados, RLS, seeds) — vira migrations na F1 |
| `mockups/dashboard-relatorio.html` | Mockup navegável do relatório por filial, com os números reais das planilhas de 2026 |

## Status

- [x] Análise das planilhas reais (1.179 ativos, 423 saídas, 291 devoluções — jan–jul/2026) e dos e-mails semanais
- [x] Decisões de arquitetura confirmadas
- [x] Especificação v1.1
- [x] Planejamento de desenvolvimento (stack fechada, fases F0–F5, estratégia de dados)
- [x] Ordens de serviço para o Claude Code (`CLAUDE.md` + `docs/prompts/F0–F5`)
- [ ] Validar o planejamento + responder perguntas da seção 13 → **só então começa código**
- [ ] F0 — fundação (Next.js + Supabase + login por convite + deploy)
- [ ] F1 — banco + dados fictícios (seed)
- [ ] F2 — operação (ativos + movimentações + estorno)
- [ ] F3 — relatórios em tempo real por filial (com dados fictícios)
- [ ] F4 — importador das planilhas + go-live (cutover)
- [ ] F5 — refino (acessórios por quantidade, alertas, e-mail, termos)

## Próximo passo

Ler e validar `docs/PLANEJAMENTO.md` (checklist da seção 8) e responder a seção 13 da especificação. Nenhum código antes disso — decisão de 09/07/2026.

Quando validar: abra o Claude Code na raiz deste repositório e cole `docs/prompts/F0-fundacao.md`. O fluxo completo está em `docs/prompts/README.md`.

Importante: o sistema **não nasce com os dados reais**. O desenvolvimento roda com dados fictícios; os dados reais entram pelo módulo de importação (F4), quando a WAP decidir virar a chave.
