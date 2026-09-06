# Controle de Estoque TI — WAP

Sistema interno para substituir o controle de ativos de TI feito hoje em três planilhas desconectadas (inventário, saída e devolução) + revisão por Gmail + relatório semanal manual por filial.

**Ideia central:** registra-se só a *movimentação* (saída, devolução, compra, transferência…) uma única vez; o estado do ativo, o estoque e os relatórios por filial derivam automaticamente por trigger no banco. O relatório deixa de ser enviado por e-mail — vira um link sempre atualizado, protegido por senha.

O sistema está **em produção desde o go-live de 15/07/2026** (1.596 ativos, 5 filiais). A entrada de dados do dia a dia é **100% manual** pelo sistema — não há sincronização com planilhas.

## Começar em 5 minutos

Pré-requisitos: **Node 24+** e **npm** (o CI roda no 24, que é o LTS ativo; o desenvolvimento, no 26). Banco, Auth e Storage rodam num projeto **Supabase de desenvolvimento** — nunca produção.

```bash
npm install
cp .env.example .env.local   # preencha com os valores do Supabase de DEV
npm run db:seed              # popula o banco de DEV com dados ficticios
npm run dev                  # app em http://localhost:3000
```

Variáveis de ambiente (todas descritas em `.env.example`):

| Variável | Para quê |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Cliente do navegador |
| `SUPABASE_SERVICE_ROLE_KEY` | Só server-side e scripts — **jamais** em Client Component ou `NEXT_PUBLIC_*` |
| `VIEW_SESSION_SECRET` | Assina o cookie da sessão de visualização por senha |
| `SEED_CONFIRM` · `SEED_PROJECT_REF` | Guardas que impedem os scripts de dados fictícios de rodarem fora do DEV |

**Nunca aponte `.env.local` para produção.** `scripts/env-guard.ts` mantém a lista `REFS_DE_PRODUCAO` e faz `db:seed`/`db:reset` recusarem qualquer ref de produção — mas a guarda é a segunda linha, não a primeira.

### Comandos

| Comando | O quê faz |
|---|---|
| `npm run dev` · `npm run build` · `npm run lint` | Desenvolvimento · build de produção · lint (obrigatório ao fim de cada ordem) |
| `npm run test` · `npm run test:watch` | Vitest — testes de funções puras (normalização de patrimônio, De→Para, datas, motor do import…) |
| `npm run db:seed` | Popula o banco de DEV com dados fictícios determinísticos (jamais aponta para produção) |
| `npm run db:reset` | Zera as tabelas de dados (exige as guardas do `.env.local`) |
| `npm run db:types` | Regenera `src/lib/types/database.ts` a partir do schema |
| `npm run contraste` | Confere o contraste das cores do sistema de design (F40) |
| `npm run db:test` · `npm run db:test:um <arquivo>` | Roda os roteiros SQL de `supabase/tests/` — **o MESMO script que o CI roda** (`scripts/db/rodar-roteiros.sh`). Precisa de um Postgres: `DATABASE_URL=…`, ou o local do `supabase start` (porta 54322). Nunca aponte para produção |
| `npm run verificar:actions` | Gate de artefato: procura Server Action registrada sem binding no build. **Rode depois de `npm run build`** — ele lê `.next/server` |
| `npm run carga` | Carga única do go-live (`scripts/import/`; guardas `CARGA_*`) — ferramenta, não feature |

O CI (`.github/workflows/ci.yml`) roda em todo push na `main` e em qualquer PR: o job `verificar` (`lint` → `test` → `contraste` → `build` → `verificar:actions`) e o job `banco`, que sobe um Postgres, aplica **todas as migrations** em ordem e roda os roteiros de `supabase/tests/` pelo mesmo script que `npm run db:test` chama. Desde a F45 o cancelamento de execução em andamento vale **só em PR**: em push na `main` cada commit tem o CI dele do começo ao fim. Desde a **F46** há um **terceiro** job, `banco-sem-docker`, que faz o mesmo trabalho do `banco` com `services: postgres:17` e o bootstrap declarado em [`supabase/ci/`](supabase/ci/) — 57s contra 3m52s, sem o Docker do Supabase e sem a CLI, e reproduzível em qualquer Postgres 17 vazio (ver [`docs/RUNBOOK-BANCO.md`](docs/RUNBOOK-BANCO.md)). Os dois rodam em paralelo e têm de chegar ao MESMO veredito; o `banco` continua sendo o *required check*, e o novo ainda não é.

> **O portão da `main` está LIGADO desde 05/09/2026 (F45)** — decisão do Johnny, ata em [`docs/DECISOES.md`](docs/DECISOES.md). `verificar` e `banco` são *required status checks*, com *require pull request* (0 aprovações) e **bypass na conta do Johnny** (`enforce_admins: false`). Provado de ponta a ponta: um PR com um roteiro SQL deliberadamente vermelho teve o merge recusado com *"the base branch policy prohibits the merge"* — [`docs/RELATORIO-F45.md`](docs/RELATORIO-F45.md) §8.5.
>
> **Consequência aceita: da F46 em diante o caminho normal é PR**, com espera do job `banco` (~3 a 6 min). O push direto continua passando para o Johnny — é o bypass —, e o GitHub avisa (`2 of 2 required status checks are expected`): usá-lo virou ato consciente.
>
> **O RISCO, dito por escrito:** a proteção é configuração **fora do repositório**, e **nenhuma trava interna impede que alguém a desligue no painel** — `src/lib/ci-passos.test.ts` defende os passos do CI, não a proteção da branch. Ligar não é defender. Para conferir: `gh api repos/vmatusita/ti-wap-inventory-control/branches/main/protection --jq '.required_status_checks.contexts'`.

## Stack (decidida em 09/07/2026)

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- **Tailwind CSS v4** + **shadcn/ui** + **Recharts v3** (análise de alternativas em [`docs/PLANEJAMENTO.md`](docs/PLANEJAMENTO.md) §2.1)
- **Supabase** (plano Free) — Postgres, Auth (login por convite), RLS, Realtime, Storage
- Deploy: **Vercel** (conta Pro já paga — custo novo R$ 0 para a empresa)

A lista é **fechada**: dependência nova exige aprovação do Johnny. O inventário completo está no [`CLAUDE.md`](CLAUDE.md).

## Duas regras que explicam metade do sistema

**Patrimônio repete.** O patrimônio identifica o equipamento, mas repete em casos raros — quem é único é o par **patrimônio + service tag** (spec §5, regra 1). Toda busca por patrimônio trata o caso de múltiplos resultados. Desde a F24 a identidade é **por filial**: o mesmo par pode coexistir em duas filiais, e o par vira a pendência "conflito entre filiais", resolvida na mesa de `/pendencias`.

**Acesso são duas portas.** *Operar* = login com conta corporativa (`@wap.ind.br`, `@stefanini.com`, `@latam.stefanini.com`), com quatro cargos em hierarquia estrita — **Desenvolvedor ⊃ Administrador ⊃ Operador ⊃ Consulta**. Todo perfil ativo **lê** tudo; o que se restringe é a **escrita** (operador escreve só nas filiais vinculadas; consulta não escreve nada). *Visualizar relatórios* = **senha de acesso, sem conta** — é outra porta, não um cargo. A regra mora no Postgres, não na tela: spec §3, [`docs/ADR-002-papeis-e-permissoes.md`](docs/ADR-002-papeis-e-permissoes.md) e [`docs/ADR-001-rls-por-filial.md`](docs/ADR-001-rls-por-filial.md).

## Onde fica o quê

| Caminho | Conteúdo |
|---|---|
| [`docs/README.md`](docs/README.md) | **Índice da documentação** — comece por aqui para achar qualquer documento |
| [`docs/ONBOARDING.md`](docs/ONBOARDING.md) | **Primeiro dia** — do clone à primeira mudança em produção |
| [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md) | Como o sistema está construído; o mapa "quero mudar X → mexo em Y" |
| [`docs/ESPECIFICACAO.md`](docs/ESPECIFICACAO.md) | **O quê** construir — modelo de dados, máquina de estados, telas, regras |
| [`CLAUDE.md`](CLAUDE.md) | Regras permanentes do agente (lido em toda sessão) |
| [`CHANGELOG.md`](CHANGELOG.md) | Histórico fase a fase, da mais recente para a mais antiga |
| `src/` · `supabase/migrations/` · `scripts/` | Código · **fonte da verdade do banco** · ferramentas (seed, carga, perf, termos) |
| [`mockups/dashboard-relatorio.html`](mockups/dashboard-relatorio.html) | Mockup navegável do relatório por filial |

A documentação do **operador** não está aqui: ela vive dentro do sistema, em `/ajuda` (28 páginas + manual imprimível), e o fonte é `src/lib/ajuda/`.

## Status

**Versão no ar: `1.51.0`.** A fonte única é `src/lib/versoes/registry.ts` — `VERSOES[0]` *é* a versão publicada, e um teste trava a divergência com o `package.json`. O operador vê o mesmo histórico em `/versoes`.

Entregue da **F0 à F46**: operação completa de ativos e movimentações, itens por quantidade, relatórios ao vivo e snapshots semanais com acesso por senha, termos gerados em `.docx`, import de startup por filial, cargos e permissões no Postgres, área `/dev` com zona destrutiva, e o sistema de design com `/ativos` e as três telas de `/itens` dentro do casco — a lista de itens mostrando, na própria linha, quanto tem em cada filial, e dizendo por extenso de qual filial são os números quando há filtro.

- **O que mudou, fase a fase:** [`CHANGELOG.md`](CHANGELOG.md) — toda entrada tem uma versão correspondente
- **O que falta:** seção *Pendências (roadmap)* no fim do [`CHANGELOG.md`](CHANGELOG.md)
- **Por que cada escolha foi feita:** [`docs/DECISOES.md`](docs/DECISOES.md) (append-only)

Definições que valem como referência permanente: as filiais oficiais (15/07/2026) são **Matriz, CD-Afonso Pena, Linhares, Eusébio e Serra** (Serra Park é filial própria; Filial-CE = Eusébio). Seguem em aberto, sem bloquear nada, as perguntas 4 a 7 da spec §13, mais **A8** (compra com patrimônio pendente) e **T11** (as duas definições de "semana") do backlog de UX — as três dependem de decisão do Johnny.

## Como as fases funcionam

As ordens rodam em **modo autônomo com acesso total** (decisão de 09/07/2026, regras no [`CLAUDE.md`](CLAUDE.md)): o Claude executa tudo — decisões, merge, deploy e produção — sem pedir autorização, compensando com autoproteções (backup/dry-run em operação destrutiva) e rastro auditável em [`docs/DECISOES.md`](docs/DECISOES.md). Cada fase é uma ordem de serviço em [`docs/prompts/`](docs/prompts/); só se executa a ordem que o Johnny colar na conversa.

O sistema **não nasce com os dados reais**. O desenvolvimento roda com dados fictícios; os dados reais entram por **carga de go-live**: a carga global inicial pelos scripts da F4 (autônoma, na janela do go-live) e, desde a F7, o **import de startup por filial** pela tela `admin/importar` (só *Substituir tudo* — spec §10.2). A entrada do dia a dia continua 100% manual — ser mais prático que o Excel é o requisito central.
