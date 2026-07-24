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
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico das fases entregues (F0→F17) |
| `supabase/migrations/` | **Fonte da verdade do banco** desde a F1 (todas as migrations em ordem; a `0029` não existe) |
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

O CI (`.github/workflows/ci.yml`) roda em todo push na `main` e em qualquer PR: um job de `lint + test + build` e um job de **banco** que sobe um Postgres, aplica **todas as migrations** em ordem e roda os roteiros de `supabase/tests/`.

## Status

**Entregue (F0 → F17):** operação completa de ativos e movimentações, itens por quantidade, relatórios ao vivo + snapshots semanais com acesso por senha, termos gerados em `.docx`, o **import de startup por filial** (`admin/importar`, só *Substituir tudo*), os **quick wins de UX da F9** (busca por colaborador, colar do Excel, filtros do histórico de itens, badge de pendências), a **operação em massa da F10** (colar/bipar a lista de patrimônios no lote — agora até **30** ativos —, sugestões de recentes e de colaborador/setor, aviso de possível duplicata, rascunho do lote que sobrevive à navegação, termos em sequência depois do registro, service tags na faixa da compra, "Comprar outro igual", carrinho multi-item nos lançamentos com criação de item inline e **export CSV** em Ativos, Pendências e Itens) e a **navegação e estrutura da F11**: a **lista de movimentações** (`/movimentacoes`) que nunca existiu, com filtros na URL e paginação; **busca global** por `Ctrl+K` / `/` com atalho `?` para a ajuda e ícone "?" contextual em 8 telas; **ordenação por coluna** e tamanho de página (25/50/100) em Ativos; saldos de itens das filiais **lado a lado** (`/itens?visao=filiais`); filtros das tabelas do relatório **no link**; e a11y dos diálogos (`useTransition`, `aria-invalid`/`aria-describedby`, foco no Cancelar). O histórico fase a fase está em [`CHANGELOG.md`](CHANGELOG.md); a ata detalhada de cada decisão, em [`docs/DECISOES.md`](docs/DECISOES.md).

A **F12** fechou os dois últimos itens que o backlog de UX devia à F5 e pagou uma dívida de verificação: **estoque mínimo por item** (campo no catálogo, coluna "Mínimo" em `admin/itens`, selo âmbar **"repor"** nas duas visões de `/itens` e card "Itens para repor" no painel inicial — o mínimo compara com o estoque **consolidado**, `0` = sem alerta e estoque igual ao mínimo ainda não acende) e **kits de movimentação salvos** (`admin/kits` + "Aplicar kit" no passo 2, com checklist de categorias que **avisa e nunca bloqueia**; o kit é cópia, então desativá-lo não mexe em nada já registrado). Migrations **`0042`** e **`0043`**, as duas aditivas. Na mesma ordem foram **auditados os 66 commits** que tinham ido a produção sem nenhum smoke autenticado desde 20/07 — **9 achados**, todos corrigidos, entre eles duas telas que caíam por endereço fora de faixa e a busca de `/movimentacoes` que nunca achava os patrimônios fora do formato canônico — e nasceu o **smoke logado reexecutável** `scripts/smoke/smoke-prod.mjs`. Evidências e limites em [`docs/RELATORIO-F12.md`](docs/RELATORIO-F12.md).

A **F13** corrigiu quatro defeitos relatados em produção — e o diagnóstico descobriu que **dois eram o mesmo**, e muito maior que o sintoma: um `export type { … }` num módulo `'use server'` (`src/lib/actions/movimentacoes.ts`) fazia o transform de Server Actions do Turbopack registrar tipos como valor, e o módulo **inteiro** morria com `ReferenceError` na avaliação. Como a paleta `Ctrl+K` (F11) importa esse módulo pelo layout do grupo `(app)`, **toda escrita do sistema respondia 500 em produção desde 22/07** — registrar movimentação, cadastrar, administrar, importar e a entrada do visualizador por senha —, embora build, lint, 870 testes e o smoke ficassem verdes (o GET das rotas continuava 200; só o POST de action quebrava). Correção: alias inline (`export type X = Y`), mais **duas guardas** — um teste de fonte que recusa a forma (`src/lib/use-server-exports.ts`) e um gate de build (`scripts/verificar-actions-build.mjs`). Junto: a **busca da nova movimentação** volta a achar (mesmo defeito), o **"?" da ajuda** passa a posicionar na seção certa mesmo sob o `loading.tsx`, o **responsivo** deixou de ter rolagem lateral nas listas e no relatório (dois padrões de layout, matriz rota×breakpoint), e um **achado de segurança fora dos quatro bugs**: a senha da tela de definir-senha podia ir para a URL num submit pré-hidratação (corrigido). **Zero migration, zero dependência nova.** Evidências, matriz e a seção "o que este relatório NÃO prova" em [`docs/RELATORIO-F13.md`](docs/RELATORIO-F13.md).

A **F14** completou o ciclo de manutenção com o **fornecedor**: toda manutenção vai para o fornecedor, que abre um chamado próprio. Agora o envio à manutenção **registra o chamado do fornecedor** (`movimentacoes.chamado_fornecedor`, obrigatório, de baixa visibilidade — só nos contextos de manutenção); o ciclo ganha o desfecho terminal **"Devolvido ao fornecedor"** (quando não teve conserto — sai do inventário como o descartado); e, nesse desfecho, o operador **cadastra o equipamento substituto no mesmo submit** (RPC atômica `devolver_ao_fornecedor` — devolução do antigo + substituto num tudo-ou-nada), com **vínculo de sucessão** (`ativos.substitui_ativo_id`): a ficha do novo mostra o histórico do antigo, a do antigo aponta para o novo. Migrations aditivas **`0044`/`0045`**, **zero dependência nova**, aplicadas em produção (acervo intocado); revisão adversarial de 5 lentes (1 achado corrigido). **929 testes.** Evidências e "o que este relatório NÃO prova" em [`docs/RELATORIO-F14.md`](docs/RELATORIO-F14.md).

A **F15** corrigiu os três primeiros defeitos que o Johnny relatou ao **usar de verdade** a devolução ao fornecedor: **(C1)** a **service tag virou obrigatória** no cadastro manual (novo equipamento e substituto) — o import segue aceitando vazio e o ativo nasce com a pendência **"sem service tag"**, resolvível por "Definir service tag" na ficha; **(C2)** o **painel de sucesso** da devolução, que antes era engolido por um `router.refresh()` que reativava o guard da página, agora **permanece na tela** mostrando os dois ativos; **(C3)** o **substituto entra como `troca`** (rótulo "Troca", pílula teal), nunca mais como "Compra" — aparece nas Entradas do relatório como troca, mas nenhuma contagem de compras o inclui (inclusive **retroativamente** nas duas já registradas). Migrations aditivas **`0046`/`0047`/`0048`**, **zero dependência nova**, aplicadas em produção; revisão adversarial de 5 lentes (1 achado corrigido + 1 gap próprio; re-revisão limpa). **947 testes.** Evidências e "o que este relatório NÃO prova" em [`docs/RELATORIO-F15.md`](docs/RELATORIO-F15.md).

A **F16** tornou o relatório mais fácil de ler e navegar, **sem migration e sem dependência nova**: movimentações **estornadas** aparecem sinalizadas nas tabelas (linha esmaecida + marca "estornada", para operador e visualizador, na impressão inclusive) — **sem mudar nenhuma contagem**; o **Δ dos KPIs ganhou cor com sentido** (verde=bom, vermelho=ruim, cinza=neutro; a seta permanece); cada tabela detalhada ganhou **busca livre** (patrimônio inclusive fora do formato, "wap 1234" acha `WAP0001234`), persistida no link e composta com os filtros; para o **operador**, o **patrimônio vira link para a ficha** e os **KPI tiles do ao vivo** levam à lista de ativos já filtrada por status/filial; no **celular**, uma setinha por linha **abre os campos que a tabela esconde**; e a **manutenção parada há 30+ dias** sobe de âmbar para **vermelho**, com um chip de contagem em Pendências (só operador). O visualizador por senha vê os mesmos números, mas nenhum atalho que saia de `/relatorios/**`. Revisão adversarial de 5 lentes (1 achado de impressão, corrigido). **993 testes.** Evidências, o achado sobre as agregações e "o que este relatório NÃO prova" em [`docs/RELATORIO-F16.md`](docs/RELATORIO-F16.md).

A **F17** fez duas coisas independentes, **sem migration e sem dependência nova**: **(A)** devolveu o **CI de banco ao verde** — o job `banco` estava vermelho desde a F15 porque o roteiro `manutencao_fornecedor.sql` (cenário 4d) ainda exigia que o substituto do fornecedor nascesse por `compra`, quando a `0047` passou a fazê-lo nascer por **`troca`**; o roteiro foi alinhado ao comportamento vigente (provado no ENSAIO), com uma regra nova no runbook ("mudou função/trigger/RPC → rode TODOS os roteiros antes do push, que `lint`/`test`/`build` não executam SQL") — **CI verde** (run `30089531148`, job `banco` incluso). **(B)** deu ao **relatório legendas que se explicam sozinhas**, para o operador **e** o visualizador por senha (que não abre `/ajuda`), no ao vivo **e** nos snapshots: a legenda do **Δ** (a cor tem sentido por indicador), a nota de **estorno** nas tabelas ("linha esmaecida = estornada depois; a contagem continua incluindo a original"), a legenda das **quatro cores** dos badges de manutenção e a seção recolhível **"Como ler este relatório"** (glossário dos 7 KPIs, "Guardados = Em estoque", Saída/Entrada/Transferência, estoque as-of, estorno). Junto: o vazio das buscas passou a dizer "nenhuma … encontrada" quando há filtro, os tiles do grupo ganharam subtítulo e a pílula "Troca" ganhou nota. Textos centralizados em funções puras testadas; legendas são **texto puro** (o viewer nunca ganha href para fora de `/relatorios`) e **nenhuma contagem muda**. Revisão adversarial de 5 lentes (1 achado de impressão/gatilho, corrigido). **1010 testes.** Evidências e "o que este relatório NÃO prova" em [`docs/RELATORIO-F17.md`](docs/RELATORIO-F17.md).

Um **ajuste pós-F17** (24/07) atendeu um pedido do Johnny: ativos que entram pelo **import de startup** (`origem='importacao'`) **não são mais cobrados por termo de responsabilidade** — o controle não existia direito na planilha antes do sistema e o acervo legado afogava `/pendencias` e o relatório (em produção, "termo pendente" caiu de **1.142 para 2**, os únicos 2 não-import; a view de pendências foi de 1.163 para 60). A obrigatoriedade continua para o cadastro manual e o `inferido`, e a ficha segue permitindo gerar um termo de um importado. Só a view `v_pendencias` mudou (**migration `0049`**, não-destrutiva, sem deploy de app); um roteiro novo (`supabase/tests/pendencias_import_termo.sql`) trava a regra no CI. Ata em [`docs/DECISOES.md`](docs/DECISOES.md).

**Pendências:**

- **F6C — carga dos saldos de itens** ([`docs/prompts/F6C-carga-saldos-itens.md`](docs/prompts/F6C-carga-saldos-itens.md)) — **próximo passo**, mas **por último na fila** (decisão de 16/07/2026: melhorias primeiro, cargas depois). É o único item que **depende de insumo do Johnny** (o export dos saldos da planilha de gestão online). Até lá, o catálogo de `itens` segue vazio e essa seção do relatório só aparece quando houver lançamentos.
- **F5 — refino** — alertas, e-mail, upload do PDF assinado (item 5.5) e o que sobra do backlog curto. O **estoque mínimo por item** (5.x/I5) e os **kits de movimentação** (5.9/M12) saíram na F12.
- **Banco — ledger, não efeito.** As migrations `0039` (drop dos backups órfãos) e `0040` (hardening das RPCs) **já estão aplicadas em produção** — medido direto no banco em 23/07/2026 (nenhuma tabela `backup%`; a guarda `p_contagens is null` está no corpo da RPC). O que falta é **registrá-las no ledger**, junto com as `0031`–`0037`; a reconciliação (só metadados) está em [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md).
- **`.env.local` desta máquina aponta para PRODUÇÃO** (`NEXT_PUBLIC_SUPABASE_URL` e `SEED_PROJECT_REF` com o ref de produção). A F11 trancou o seed/reset contra refs de produção (`scripts/env-guard.ts`), mas o certo é o arquivo apontar para o projeto de **ensaio** — ação do Johnny.

O **backlog de UX fechou**: a Onda 1 saiu na F9, a Onda 2 (operação em massa) na F10, a Onda 3 (navegação e estrutura) na F11 e, na **F12**, os dois itens que ainda pertenciam a outra fase — **M12/kits** e **I5/estoque mínimo**, ambos da F5. Do backlog resta só a carga da F6C e o que **exige decisão do Johnny**: A8 (compra com patrimônio pendente), T11 (as duas definições de "semana") e T12 (remover `next-themes`).

Pendências não bloqueantes: perguntas 4, 5, 6 e 7 da spec §13. As filiais oficiais foram definidas em 15/07/2026: **Matriz, CD-Afonso Pena, Linhares, Eusébio e Serra** (Serra Park é filial própria; Filial-CE = Eusébio).

## Como as fases funcionam

As ordens rodam em **modo autônomo com acesso total** (decisão de 09/07/2026, regras no [`CLAUDE.md`](CLAUDE.md)): o Claude executa tudo — decisões, merge, deploy e produção — sem pedir autorização, compensando com autoproteções (backup/dry-run em operação destrutiva) e rastro auditável em [`docs/DECISOES.md`](docs/DECISOES.md). Cada fase é uma ordem de serviço em [`docs/prompts/`](docs/prompts/); só se executa a ordem que o Johnny colar na conversa.

O sistema **não nasce com os dados reais**. O desenvolvimento roda com dados fictícios; os dados reais entram por **carga de go-live**: a carga global inicial pelos scripts da F4 (autônoma, na janela do go-live) e, desde a F7, o **import de startup por filial** pela tela `admin/importar` (só *Substituir tudo*, go-live novo de uma filial — spec §10.2). A entrada do dia a dia continua 100% manual — ser mais prático que o Excel é o requisito central.
