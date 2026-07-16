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

## Desenvolvimento local

Pré-requisitos: **Node 20+** e **npm**. Banco, Auth e Storage rodam num projeto **Supabase de desenvolvimento** — nunca produção.

1. `npm install`
2. Copie `.env.example` para `.env.local` e preencha com os valores do Supabase **de DEV**.
3. `npm run dev` → app em `http://localhost:3000`.

Variáveis de ambiente (todas documentadas em `.env.example`): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (só server-side/scripts — nunca `NEXT_PUBLIC`), `VIEW_SESSION_SECRET` (assina o cookie da sessão de visualização por senha) e as guardas `SEED_CONFIRM`/`SEED_PROJECT_REF`, que impedem os scripts de dados fictícios de rodarem fora do DEV.

Scripts (dados 100% fictícios — jamais apontam para produção):

| Comando | O quê faz |
|---|---|
| `npm run dev` / `npm run build` / `npm run lint` | Desenvolvimento · build de produção · verificação obrigatória ao fim de cada ordem |
| `npm run db:seed` | Popula o banco de DEV com dados fictícios determinísticos |
| `npm run db:reset` | Zera as tabelas de dados (exige as guardas do `.env.local`) |
| `npm run db:types` | Regenera `src/lib/types/database.ts` a partir do schema (CLI linkada; grava só se a saída for TypeScript válido) |

## Status

- [x] Análise das planilhas reais (1.179 ativos, 423 saídas, 291 devoluções — jan–jul/2026) e dos e-mails semanais
- [x] Decisões de arquitetura confirmadas
- [x] Especificação v1.1
- [x] Planejamento de desenvolvimento (stack fechada, fases F0–F5, estratégia de dados)
- [x] Ordens de serviço para o Claude Code (`CLAUDE.md` + `docs/prompts/F0–F5`)
- [x] Planejamento validado → execução autônoma iniciada
- [x] **F0 — fundação** — concluída em 10/07/2026 (Next 16.2.10, login por convite restrito a `@wap.ind.br`, layout, sessão via proxy, deploy)
- [x] **F1 — banco + dados fictícios** — concluída em 10/07/2026 (migrations 0001–0007 incl. `senhas_acesso`, seed determinístico com guardas anti-produção, tipos gerados, roteiro SQL de teste da máquina de estados)
- [x] **F2 — operação** — concluída em 13/07/2026 (lista com filtros/busca server-side + data-table, ficha com linha do tempo, nova movimentação em lote com validações Zod espelhando a máquina de estados, estorno da última movimentação, **entrada de equipamento novo por compra — single/lote via lista ou faixa de patrimônios, atômica (RPC `criar_compra_lote`, migration 0008)**, facilitadores anti-Excel: atalho `N`, "repetir última", "duplicar", data default, foco na busca)
- [x] **F3 — relatórios + administração** — concluída em 13/07/2026 (relatório **ao vivo** `/relatorios/[filial]` + consolidado `geral` com tabs, filtro de período, KPIs, gráficos Recharts via wrapper `chart`, disponíveis por modelo, em manutenção, reservados, últimas movimentações com observação, **resumo no formato do e-mail**; **snapshot semanal versionado** `/relatorios/gerados` — imutável, "fim da errata"; **acesso por senha** sem conta — scrypt + cookie HMAC, revogação com efeito no request seguinte, shell reduzido; **tempo real** p/ operador + auto-refresh p/ visualizador; export CSV `;`+BOM e impressão; administração: convites `@wap.ind.br`, senhas de acesso, filiais, motivos; migrations 0009–0011)
- [x] **F3B — relatórios v2** — concluída em 14/07/2026 (relatório no **formato do e-mail**: 3 grupos — principais/acessórios/componentes — + tabelas de Saídas/Entradas/Transferências, chips-âncora, KPIs com Δ; **itens por quantidade** antecipados da F5 — catálogo `admin/itens` + tela `/itens` com saldo/atrelados/**falta** automática, trigger de saldo no Postgres; **anotações** na linha do tempo; reconstrução **as-of** do estoque; snapshot **schema 2** que congela os 3 grupos e mantém v1 abrindo; **sem export CSV**; migrations 0014–0018 — plano `docs/PLANO-RELATORIOS-V2.md`, resumo aprovado `docs/RELATORIO-V2-PARA-APROVACAO.md`)
- [x] **F5A — termos gerados pelo sistema** — concluída em 14/07/2026 (os 7 modelos — 5 de responsabilidade + 2 de devolução — gerados em `.docx` **fiel ao original**, preenchidos pelo sistema com todos os campos editáveis, **preview do arquivo real** no navegador e download; snapshot `jsonb` + arquivo no **Storage privado**, versão única por termo; novo status `gerado` que continua contando como pendência; migrations 0020–0021; plano `docs/PLANO-TERMOS.md`, OS `docs/prompts/F5A-termos.md`). Independente da F4 — roda antes ou depois do go-live.
- [x] **F4 — carga inicial única + go-live** — **CUTOVER em 15/07/2026**: dados reais em produção (**1.596 ativos** — 17 inferidos — e **3.231 movimentações** das 5 filiais, zero falhas do trigger; estado conferido 1.596/1.596 contra a planilha; reexecução idempotente sem duplicar nada). Scripts em `scripts/import/` (3 layouts por nome de coluna, reconciliação compra→replay→ajuste, dry-run com relatório de inconsistências, guardas `CARGA_*`), revisão adversarial com 8 correções, ensaio aprovado no 2º projeto free antes da produção; migration 0026 (filial `serra`); ata completa em `docs/DECISOES.md`. **A partir de agora as planilhas antigas são somente-leitura e não existe importação — a entrada de dados é 100% pelo sistema.** Pendente da janela: carga dos **saldos de itens** (aguarda o export da planilha de gestão online) e criação das senhas de acesso das filiais em `admin/senhas`
- [x] **F6A — correções pós-go-live** — concluída em 16/07/2026 (execução multi-agente `F6A-ultracode.md`): filtro da carga go-live fora do relatório do período (`.or` null-safe, sem tocar dado); semântica **Total/Estoque** dos itens (atrelar/liberar descontam o estoque, devolução/retorno repõem — migration 0027, novo tipo `retorno`, estorno redesenhado, `falta` = déficit real); **pendências só para o operador** com página `/pendencias` (migration 0028, corte no render + defesa em profundidade). Migrations aplicadas em produção, deploy único, revisão adversarial + auditoria A2. Pendência devolvida ao Johnny: 2 snapshots congelados do go-live com a carga (chip). Próximo: F6B
- [x] **F6B — melhorias de UX** — concluída em 16/07/2026 (execução multi-agente `F6B-ultracode.md`, 2 ondas em worktrees isolados + revisão adversarial): loading nativo (barra global + skeletons por rota, zero lib); relatório ao vivo default **semana dom–sáb**; resumo com quebra de linha no `;`; **observação** no snapshot (migration 0030) visível ao visualizador; **seção de movimentações de itens** no relatório (exclui a carga F6C); **confirmar/desfazer assinatura** do termo (rastro em anotações); **corrigir patrimônio** (service tag imutável); **sessões de 24h** (operador + visualizador); **página `/ajuda`** derivada de `dominio.ts`. Migration 0030 em produção, deploy único, zero dependência nova. Decisões em `docs/DECISOES.md` (2026-07-16 · F6B). Próximo: F6C
- [~] **F7 — import de startup por CSV no admin** — **construída, integrada, revisada e documentada na `main` em 16/07/2026** (execução multi-agente `F7-ultracode.md`: W1 motor ∥ W2 banco → W3 tela → revisão adversarial de 7 dimensões, 1 achado corrigido — janela TOCTOU fechada com re-checagem de contagens sob o lock). Tela `admin/importar` para o **go-live novo de cada filial** — só modo Substituir tudo (delete físico assumido, com backup automático + preview do custo + confirmação pelo nome da filial), preview tudo-ou-nada com erros linha a linha, **entrada com a data real do CSV** (sem data válida = marcada fora dos relatórios do período). Modo Atualizar adiado. Migrations `0031` (import_logs + bucket) e `0032` (RPC transacional) escritas; `0031` + a função aplicadas no **DEV**. **Revoga a regra "não existe importação, nunca"** — documentos emendados (spec §10.2, CLAUDE.md, este README). **Pendente (gate):** o classificador do modo automático bloqueia a *execução* do import destrutivo — o **smoke ao vivo no DEV** e a **aplicação/deploy em produção** aguardam o aval do Johnny (roteiro de validação pronto). `lint`+`test`(333)+`build` verdes. Decisões em `docs/DECISOES.md` (2026-07-16 · F7)
- [ ] **F6C — carga dos saldos de itens** (`docs/prompts/F6C-carga-saldos-itens.md`): **por último**, quando o export da planilha de gestão online existir — decisão do Johnny (16/07/2026): melhorias primeiro, cargas depois
- [ ] F5 — refino (alertas, e-mail, estoque mínimo por item; upload do PDF assinado — item 5.5)

Pendências não bloqueantes: perguntas 4, 5, 6 e 7 da spec §13. A nº 1 — filiais oficiais — foi **respondida em 15/07/2026**: Matriz, CD-Afonso Pena, Linhares, Eusébio e Serra (Serra Park é filial própria; Filial-CE = Eusébio).

## Próximo passo

**F6C — carga dos saldos de itens** (`docs/prompts/F6C-carga-saldos-itens.md`) — **por último**, quando o Johnny entregar o export da planilha de gestão online (decisão de 16/07/2026: melhorias primeiro, cargas depois). É o único item que **depende de insumo do Johnny** (o CSV/export dos saldos); a carga marcará os lançamentos de abertura com `observacao = 'saldo inicial (go-live)'`, que a F6B já exclui da tabela de movimentações de itens do relatório. Até lá, o catálogo de `itens` segue vazio e essa seção do relatório só aparece quando houver lançamentos. O backlog aberto está em `docs/DECISOES.md` (F6B — atalho `?` da Ajuda, import da constante `OBS_SALDO_INICIAL` na carga) e o F5 de refino (alertas, e-mail, estoque mínimo por item, upload do PDF assinado — item 5.5).

As ordens rodam em **modo autônomo com acesso total** (decisão de 09/07/2026, regras no `CLAUDE.md`): o Claude executa tudo — decisões, merge, deploy e produção — sem pedir autorização, compensando com autoproteções (backup/dry-run em operação destrutiva) e rastro auditável em `docs/DECISOES.md`.

Importante: o sistema **não nasce com os dados reais**. O desenvolvimento roda com dados fictícios; os dados reais entram por uma **carga única via scripts no go-live** (F4), executada de forma autônoma na janela do go-live. Depois disso **não existe importação** — a entrada de dados é 100% manual pelo sistema, e ser mais prático que o Excel é o requisito central (facilitadores da F2).
