# Controle de Estoque TI — WAP

Sistema interno para substituir o controle de ativos de TI feito hoje em três planilhas desconectadas (inventário, saída e devolução) + revisão por Gmail + relatório semanal manual por filial.

**Ideia central:** registra-se só a *movimentação* (saída, devolução, compra, transferência…) uma única vez; o estado do ativo, o estoque e os relatórios por filial derivam automaticamente por trigger no banco. O relatório deixa de ser enviado por e-mail — vira um link sempre atualizado, protegido por senha.

O sistema está **em produção desde o go-live de 15/07/2026** (1.596 ativos, 5 filiais). A entrada de dados do dia a dia é **100% manual** pelo sistema — não há sincronização com planilhas.

## Stack (decidida em 09/07/2026)

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- **Tailwind CSS v4** + **shadcn/ui** + **Recharts v3** (análise de alternativas em [`docs/PLANEJAMENTO.md`](docs/PLANEJAMENTO.md) §2.1)
- **Supabase** (plano Free) — Postgres, Auth (login por convite), RLS, Realtime, Storage
- Deploy: **Vercel** (conta Pro já paga — custo novo R$ 0 para a empresa)

**Regra de patrimônio:** o patrimônio identifica o equipamento, mas repete em casos raros — quem é único é o par **patrimônio + service tag** (spec §5, regra 1). Toda busca por patrimônio trata o caso de múltiplos resultados.

**Modelo de acesso (duas portas):** operar = login com conta corporativa (`@wap.ind.br`, `@stefanini.com` ou `@latam.stefanini.com` — nível único, todo logado é admin); visualizar relatórios = **senha de acesso, sem conta** (senhas com rótulo, criadas e revogadas individualmente pelo admin). Detalhes na spec §3 e em [`docs/ADR-001-rls-por-filial.md`](docs/ADR-001-rls-por-filial.md).

## Estrutura deste repositório

| Caminho | Conteúdo |
|---|---|
| [`CLAUDE.md`](CLAUDE.md) | Regras permanentes para o Claude Code (lido em toda sessão): modo autônomo, stack travada, convenções, estrutura prescrita, dados fictícios, custo zero |
| [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md) | **O quê** — especificação completa: problema, conceito, modelo de dados, máquina de estados (§4), vocabulários De→Para (§5), telas (§6), relatórios (§7), regras (§8) |
| [`docs/PLANEJAMENTO.md`](docs/PLANEJAMENTO.md) | **Como e quando** — stack fechada, estratégia de dados, fases e definição de pronto |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | **Como está construído** — modelo mental, fluxo de dados, camadas do código, onde mora cada regra (ponto de partida para quem chega ao código) |
| [`docs/prompts/`](docs/prompts/) | **Ordens de serviço** (F0 em diante) — um prompt detalhado por fase; leia [`docs/prompts/README.md`](docs/prompts/README.md) antes |
| [`docs/DECISOES.md`](docs/DECISOES.md) | Rastro de auditoria das decisões autônomas (append-only) |
| [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md) | Procedimento de migrations/deploy de banco (o "gate", apply manual, armadilhas) |
| [`docs/DIVIDA-TECNICA.md`](docs/DIVIDA-TECNICA.md) | Auditoria de dívida técnica (diagnóstico priorizado) |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico das fases entregues (F0→F7K) |
| `supabase/migrations/` | **Fonte da verdade do banco** desde a F1 (0001→0040; a `0029` não existe) |
| [`mockups/dashboard-relatorio.html`](mockups/dashboard-relatorio.html) | Mockup navegável do relatório por filial |

## Desenvolvimento local

Pré-requisitos: **Node 20+** e **npm**. Banco, Auth e Storage rodam num projeto **Supabase de desenvolvimento** — nunca produção.

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha com os valores do Supabase **de DEV**.
3. `npm run dev` → app em `http://localhost:3000`.

Variáveis de ambiente (todas em `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (só server-side/scripts — nunca `NEXT_PUBLIC`), `VIEW_SESSION_SECRET` (assina o cookie da sessão de visualização por senha) e as guardas `SEED_CONFIRM`/`SEED_PROJECT_REF`, que impedem os scripts de dados fictícios de rodarem fora do DEV.

### Comandos

| Comando | O quê faz |
|---|---|
| `npm run dev` / `npm run build` / `npm run lint` | Desenvolvimento · build de produção · lint (verificação obrigatória ao fim de cada ordem) |
| `npm run test` | Vitest — testes de funções puras (normalização de patrimônio, De→Para, datas, motor do import…) |
| `npm run db:seed` | Popula o banco de DEV com dados fictícios determinísticos (100% fictícios — jamais aponta para produção) |
| `npm run db:reset` | Zera as tabelas de dados (exige as guardas do `.env.local`) |
| `npm run db:types` | Regenera `src/lib/types/database.ts` a partir do schema |
| `npm run carga` | Carga única do go-live (`scripts/import/`; guardas `CARGA_*`) — ferramenta, não feature |

O CI (`.github/workflows/ci.yml`) roda em todo push na `main` e em qualquer PR: um job de `lint + test + build` e um job de **banco** que sobe um Postgres, aplica todas as migrations (`0001→0040`) e roda os roteiros de `supabase/tests/`.

## Status

**Em produção (F0 → F9):** operação completa de ativos e movimentações, itens por quantidade, relatórios ao vivo + snapshots semanais com acesso por senha, termos gerados em `.docx`, o **import de startup por filial** (`admin/importar`, só *Substituir tudo*) e os **quick wins de UX da F9** (busca por colaborador, colar do Excel, filtros do histórico de itens, badge de pendências). O histórico fase a fase está em [`CHANGELOG.md`](CHANGELOG.md); a ata detalhada de cada decisão, em [`docs/DECISOES.md`](docs/DECISOES.md).

**Pendências:**

- **F6C — carga dos saldos de itens** ([`docs/prompts/F6C-carga-saldos-itens.md`](docs/prompts/F6C-carga-saldos-itens.md)) — **próximo passo**, mas **por último na fila** (decisão de 16/07/2026: melhorias primeiro, cargas depois). É o único item que **depende de insumo do Johnny** (o export dos saldos da planilha de gestão online). Até lá, o catálogo de `itens` segue vazio e essa seção do relatório só aparece quando houver lançamentos.
- **F5 — refino** — alertas, e-mail, estoque mínimo por item, upload do PDF assinado (item 5.5).
- **Ondas 2 e 3 do backlog de UX** ([`docs/BACKLOG-UX.md`](docs/BACKLOG-UX.md)) — a Onda 1 saiu na F9; ficam a operação em massa (colar lista na movimentação, autocomplete, alerta de duplicata, multi-item, export CSV) e a navegação/estrutura (busca global, lista de movimentações, ordenação de colunas).
- **Banco** — aplicar as migrations `0039` (drop dos backups órfãos) e `0040` (hardening das RPCs) em produção (gate; ver [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md)).

Pendências não bloqueantes: perguntas 4, 5, 6 e 7 da spec §13. As filiais oficiais foram definidas em 15/07/2026: **Matriz, CD-Afonso Pena, Linhares, Eusébio e Serra** (Serra Park é filial própria; Filial-CE = Eusébio).

## Como as fases funcionam

As ordens rodam em **modo autônomo com acesso total** (decisão de 09/07/2026, regras no [`CLAUDE.md`](CLAUDE.md)): o Claude executa tudo — decisões, merge, deploy e produção — sem pedir autorização, compensando com autoproteções (backup/dry-run em operação destrutiva) e rastro auditável em [`docs/DECISOES.md`](docs/DECISOES.md). Cada fase é uma ordem de serviço em [`docs/prompts/`](docs/prompts/); só se executa a ordem que o Johnny colar na conversa.

O sistema **não nasce com os dados reais**. O desenvolvimento roda com dados fictícios; os dados reais entram por **carga de go-live**: a carga global inicial pelos scripts da F4 (autônoma, na janela do go-live) e, desde a F7, o **import de startup por filial** pela tela `admin/importar` (só *Substituir tudo*, go-live novo de uma filial — spec §10.2). A entrada do dia a dia continua 100% manual — ser mais prático que o Excel é o requisito central.
