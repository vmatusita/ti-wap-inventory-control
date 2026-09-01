# F0 — Fundação do Acervo (produto multiempresa)

Ordem de serviço autônoma para o Claude Code fundar o repositório do **Acervo** — o sucessor multiempresa do Estoque TI WAP — conforme a fase F0 do `docs/PLANO-PRODUTO-MULTIEMPRESA.md`. Decisões já tomadas pelo Johnny (14/08/2026): working title **Acervo** (slug `acervo`) · repo **privado no GitHub pessoal** · projeto Supabase de DEV **criado por você antes**, chaves no `.env.local`.

## Prompt (copie o bloco inteiro)

```text
ultracode

# Missão
Fundar o repositório do Acervo — produto multiempresa de controle de ativos de TI, sucessor do Estoque TI WAP — deixando a F0 completa e provada: projeto Next.js com a stack travada, CLAUDE.md do produto, CI com job de banco, migration 0001 (só o alicerce de auth), autenticação por convite funcionando contra o Supabase de DEV, layout base neutro, registry de versões com a v0.1.0 e relatório final com evidências reais. Nenhum schema ou tela de negócio — isso é a F1.

# Contexto
- CAMINHO_WAP = ../ti-wap-inventory-control  ← repositório da WAP, referência de padrões, SÓ LEITURA. Se o caminho não bater, procure a pasta irmã com esse nome antes de desistir.
- Fontes de verdade, nesta ordem: (1) esta ordem; (2) CAMINHO_WAP/docs/PLANO-PRODUTO-MULTIEMPRESA.md (o plano do produto — a F0 está no §7; as regras de arquitetura, no §4); (3) os padrões do código da WAP.
- Leia da WAP antes de escrever qualquer coisa: CLAUDE.md, docs/ARQUITETURA.md, docs/PLANEJAMENTO.md (§2 stack travada e §6 definição de pronto), eslint.config.mjs, tsconfig.json, next.config.ts, vitest.config.ts, .github/workflows/ci.yml, package.json (scripts), src/lib/supabase/* e src/lib/auth/* (fluxo de convite/sessão — portar SEM a trava de domínios de e-mail, que no produto é regra por empresa e pertence à F2), src/lib/versoes/* (registry de versões) e a migration 0057 (o desenho de profiles com nome em coluna GERADA).
- Este diretório é o repositório novo (vazio, exceto talvez este prompt e o .env.local).
- .env.local já existe aqui com: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY e SUPABASE_DB_URL (connection string Postgres do MESMO projeto DEV). NUNCA imprima, logue, commite ou cole esses valores em lugar nenhum — nem no relatório.
- Stack travada (idêntica à da WAP; versões atuais conferidas na doc oficial, nunca de memória): Next.js 16 App Router + React 19 + TypeScript strict · Tailwind v4 · shadcn/ui · @supabase/supabase-js + @supabase/ssr · Zod + react-hook-form · Vitest · ESLint + Prettier. NÃO instale agora o que a F0 não usa (Recharts, TanStack Table, PapaParse, docxtemplater etc. entram nas fases donas). Dependência fora dessa lista só com registro em DECISOES.md (o driver `pg` como devDependency para scripts de banco já está pré-aprovado).

# Pré-requisitos (verifique ANTES de qualquer escrita; falhou → pare com mensagem clara do que falta)
1. CAMINHO_WAP existe e docs/PLANO-PRODUTO-MULTIEMPRESA.md é legível.
2. .env.local presente com as 4 variáveis não-vazias.
3. node ≥ 20 e npm disponíveis.
4. O Supabase de DEV responde: um script mínimo com o service role faz uma chamada trivial (ex.: listar usuários do Auth, esperando lista vazia) — sem imprimir segredos.
5. `gh auth status` OK é DESEJÁVEL, não obrigatório: sem ele, siga 100% local e registre a pendência "criar repo no GitHub" no relatório.
Passou 1–4: execute até o fim sem parar.

# Escopo
Dentro (a entrega da F0):
1. git init (branch main) + trabalho na branch f0-fundacao; estrutura de pastas prescrita, a mesma da WAP: src/app, src/lib/{supabase,auth,queries,actions,validators,versoes,types}, src/components, supabase/migrations, supabase/tests, scripts/{db,smoke}, docs/prompts.
2. CLAUDE.md do produto (< 200 linhas), adaptado do da WAP SEM os WAP-ismos, contendo obrigatoriamente estas regras permanentes: modo autônomo com decisões registradas em docs/DECISOES.md (append-only); stack travada acima; estrutura prescrita; NUNCA dado real de NENHUM cliente em código, seed, fixture, teste ou screenshot (e-mails de teste só @exemplo.dev); o repositório da WAP é referência de CÓDIGO, jamais de DADOS; custo R$ 0 (nenhum serviço/tier pago sem aprovação registrada); migrations em supabase/migrations são a fonte da verdade do banco — nunca editar uma aplicada, toda mudança é uma nova; a regra de negócio mora no Postgres (trigger/RLS/RPC com guarda interna), a UI é a segunda linha; A PARTIR DA F1, fase que toca schema só fecha com o roteiro de isolamento entre empresas verde no CI; toda entrega gera entrada no CHANGELOG.md E no registry de versões; integrações sempre conferidas na doc oficial atual (Context7/web), nunca de memória; pt-BR na interface e docs, inglês em código e identificadores.
3. docs/: DECISOES.md iniciado (com as decisões desta run), DIVIDA-TECNICA.md (estrutura vazia), prompts/README.md (o fluxo de ordens, resumido do da WAP).
4. App Next.js: create-next-app (TypeScript, App Router, Tailwind v4, ESLint) + Prettier + shadcn init com tema NEUTRO (zinc/slate padrão; nada do amarelo WAP; a cor por empresa chega em fase futura).
5. Banco — migration supabase/migrations/0001_fundacao.sql, SÓ o alicerce de auth: tabela public.profiles espelho de auth.users (id, primeiro_nome, sobrenome, nome como coluna GERADA concatenando os dois — porte o desenho da 0057 da WAP —, created_at), trigger de criação de profile no signup com fallback do e-mail em primeiro_nome, RLS HABILITADA em profiles (usuário lê e edita só a própria linha; anon não lê nada). NENHUMA tabela de negócio (empresas, unidades, membros, ativos, movimentacoes, itens…): é F1.
6. Scripts de banco cross-platform (Node + pg, lendo SUPABASE_DB_URL): scripts/db/apply-migrations.mjs (aplica supabase/migrations/*.sql em ordem, idempotente via tabela de controle simples) e scripts/db/run-sql-tests.mjs (roda supabase/tests/*.sql e falha se alguma asserção falhar). Scripts npm: db:apply, db:test:sql, db:types (este via `npx supabase gen types typescript --db-url ...` lendo a env — sem login no CLI).
7. supabase/tests/fundacao.sql com asserções mínimas: profiles existe; RLS está ativa em profiles; o trigger de signup existe.
8. Auth funcionando com @supabase/ssr: /login (e-mail+senha), callback de convite + /definir-senha (fluxo portado da WAP, simplificado, SEM trava de domínio), middleware de sessão, grupo (app) protegido (sem sessão → redirect para /login), sair. Página inicial do (app): layout base neutro (sidebar mínima + header) com um card "Acervo — fundação (F0)". Convidar usuário na F0 = ação manual no painel do Supabase; tela de convite é da F2.
9. Registry de versões: src/lib/versoes/registry.ts com a v0.1.0 (data, fase F0, texto em linguagem de operador) + página /versoes (dentro do (app)) + badge v0.1.0 no pé da sidebar + teste que valida o registry (ordenado, sem versão duplicada, entrada casa com o CHANGELOG).
10. CHANGELOG.md (entrada v0.1.0 — F0) e README.md curto (o que é o Acervo, stack, como rodar, onde está o plano).
11. CI .github/workflows/ci.yml: job "verificar" (lint + test + build) e job "banco" (service container de Postgres; aplica as migrations em ordem e roda os roteiros de supabase/tests — reaproveite os scripts de banco apontando a DB URL do service).
12. Vitest com ≥ 3 testes reais (registry de versões; helper de auth portado; validator Zod do definir-senha).
13. GitHub (se o pré-requisito 5 passou): `gh repo create acervo --private` na conta pessoal, remote origin, push da main e da f0-fundacao. Sem gh: pendência no relatório.
14. Vercel: SOMENTE se `npx vercel whoami` já estiver autenticado → link + deploy de preview + smoke (GET / responde 200 ou redirect para /login). Senão: pule sem tentar autenticar e registre a pendência.

Fora (NÃO faça):
- Nenhuma tabela, view, RPC, tela ou vocabulário de negócio; nenhum seed; nenhuma trava de domínio de e-mail; nenhum subdomínio; nada de F1+ "aproveitando que está aqui".
- NENHUMA escrita em CAMINHO_WAP — qualquer modificação lá é violação grave; é leitura, apenas.
- Nenhum recurso pago, nenhum projeto Supabase novo, nenhum segredo em código/commit/log/relatório.
- Dark mode fica de fora (registre no backlog de DIVIDA-TECNICA.md).
- Não abra PR; não faça merge na main antes da verificação final limpa.

# Critérios de aceitação
- `npm run lint` termina com 0 erros e 0 warnings; `npm run build` conclui com sucesso; `npm run test` passa com ≥ 3 testes reais.
- `npm run db:apply` aplica a 0001 no DEV com sucesso e é idempotente (2ª execução = no-op); `npm run db:test:sql` passa; `npm run db:types` gera src/lib/types/database.ts sem erro.
- Prova de auth de ponta a ponta contra o DEV, automatizada em scripts/smoke/f0-auth.mjs: (1) cria usuário de teste fictício via admin API (e-mail @exemplo.dev), (2) faz sign-in com senha via anon key, (3) confere que o trigger criou o profile com o fallback do e-mail, (4) com `npm run dev` de pé, GET / sem cookie responde redirect para /login e GET /login responde 200, (5) apaga o usuário de teste ao final. Saída real colada no relatório.
- /versoes renderiza a v0.1.0 e o CHANGELOG.md tem a entrada correspondente (o teste do registry cobre a consistência).
- CLAUDE.md do produto existe, < 200 linhas, com TODAS as regras permanentes do escopo item 2.
- Working tree limpa, commits pequenos com mensagens descritivas em inglês, main contendo o resultado via merge fast-forward da f0-fundacao só depois de tudo verde.

# Verificação — rode de verdade
Após CADA incremento: lint + test + build; leia as falhas, corrija a CAUSA RAIZ e repita até passar. Proibido suprimir erro, desabilitar regra de lint, pular ou deletar teste para "passar". Os scripts de banco e o smoke de auth rodam de verdade contra o DEV — se algo falhar por ambiente (porta ocupada, rede), resolva (outra porta, retry com backoff) e registre. Ao final, rode a bateria completa (lint, test, build, db:apply idempotente, db:test:sql, smoke) e guarde TODAS as saídas para o relatório.

# Autonomia e decisões
Você está rodando de forma autônoma; ninguém vai responder perguntas. Não pare para perguntar nem espere confirmação em nenhuma hipótese. Régua de decisão: (1) esta ordem; (2) o plano do produto (PLANO-PRODUTO-MULTIEMPRESA.md); (3) os padrões do repositório da WAP; (4) restando ambiguidade, a opção mais simples e reversível. Decisão não-óbvia → docs/DECISOES.md (decisão, alternativas, porquê). A mesma falha persistindo após ~3 tentativas: mude de abordagem e registre a troca. Bloqueio real (ex.: DEV fora do ar, gh sem auth): contorne se seguro; senão siga com o resto e registre no relatório a pendência e o que falta para resolver.

# Git e segurança
Branch f0-fundacao a partir da main vazia; commits pequenos e frequentes. NUNCA: force push, `git reset --hard`, `git checkout -- .`, `git clean -fd`, amend de commit que não é seu, push para repositório que não seja o `acervo` recém-criado, deploy ou migração em qualquer projeto que não seja o DEV do .env.local. O repositório da WAP é intocável. Segredos nunca em commit — confira o .gitignore (.env*, tsbuildinfo, .next) antes do primeiro commit.

# Como trabalhar
1. Explorar com subagentes paralelos, cada um voltando só com resumo: (a) plano do produto + CLAUDE.md/ARQUITETURA da WAP → lista das regras e convenções a portar; (b) configs e scripts da WAP (eslint/tsconfig/next/vitest/CI/package.json) → o que copiar e o que adaptar; (c) fluxo de auth + registry de versões da WAP → desenho do transplante sem a trava de domínio.
2. Escrever PLAN.md autossuficiente (arquivos e interfaces nomeados, fora-de-escopo declarado, a verificação de ponta a ponta no final) antes de implementar.
3. Implementar em incrementos pequenos e verificados, na ordem: scaffold → CLAUDE.md/docs → banco+scripts → auth → layout/versões → CI → GitHub/Vercel condicionais.
4. Revisão adversarial final por subagente em contexto FRESCO, contra PLAN.md e os critérios, com quatro lentes: aderência ao plano (nada de F1 antecipada?), segurança (segredo vazado? RLS de profiles certa? redirect de auth certo?), CI honesto (o job banco roda migrations de verdade?), simplicidade (algo genérico demais para a F0?). Aponte apenas lacunas de correção ou de requisitos declarados — não preferências de estilo. Corrija e re-revise até limpar.

# Relatório final
docs/RELATORIO-F0.md em pt-BR: o que existe agora (mapa do repo), decisões tomadas (apontando DECISOES.md), EVIDÊNCIAS — saídas reais e completas de lint, test, build, db:apply (as duas execuções), db:test:sql e do smoke de auth —, pendências com o que falta para resolver (ex.: Vercel/GitHub se pulados), e os próximos passos (a F1 — núcleo multi-tenant — conforme o plano §7). Termine a resposta final com um resumo de 5 linhas em pt-BR.

# Idioma
Narrativa, plano, relatório e textos de interface em pt-BR. Código, identificadores e nomes de arquivo em inglês (exceto os .md de documentação, que seguem o padrão da casa em pt-BR). Commits em inglês.
```

## Como executar

**Pré-voo (uma vez, ~10 min):**

1. Crie a pasta do produto **ao lado** da pasta da WAP: `C:\Users\victor.matusita\OneDrive - FRESNOMAQ IND DE MAQUINAS SA\Documents\Projetos\acervo` (o prompt assume a WAP em `../ti-wap-inventory-control`). Dica: por ser um repositório git com `node_modules`, considere criar **fora** do OneDrive (ex.: `C:\dev\acervo`) — nesse caso, **edite a linha `CAMINHO_WAP = ...` no topo do prompt** para o caminho completo da pasta da WAP antes de colar. Se criar dentro do OneDrive como irmã da WAP, o prompt funciona como está; marque a pasta como "sempre manter neste dispositivo".
2. Crie o projeto Supabase **DEV** (plano Free, de preferência já numa conta/organização nova do produto) e salve na pasta um `.env.local` com: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_DB_URL` (Dashboard → Connect → connection string *Direct*; inclua a senha do banco).
3. Confira: `node --version` (≥ 20), `gh auth status` (para o repo privado nascer no seu GitHub) e, se quiser o deploy de preview, `npx vercel whoami`.
4. Salve o bloco do prompt como `prompt-f0.md` dentro da pasta e rode `claude` uma vez ali, só para aceitar o diálogo de confiança do diretório — depois saia.

**Rodar (interativo desatendido — recomendado):**

```powershell
cd "C:\...\Projetos\acervo"
claude --model opus --permission-mode auto -n f0-acervo
```

Cole o prompt inteiro e saia de perto. O modo `auto` executa sem perguntar e mantém o classificador de segurança de pé — é o certo para a sua máquina de trabalho (não use `--dangerously-skip-permissions` fora de sandbox). Requer Claude Code atual (`claude --version` ≥ 2.1.83). Para subir o rigor, logo após colar o prompt: `/goal npm run lint, npm run test e npm run build passam sem erros e docs/RELATORIO-F0.md existe com as saídas reais coladas`.

**Alternativa headless (noite):**

```powershell
claude -p "$(Get-Content prompt-f0.md -Raw)" --model opus --permission-mode auto --output-format json > run-f0.json
```

Guarde o `session_id` do JSON (única forma de retomar sessões `-p`). Custo: run multiagente consome ~15× um chat comum; para baratear, `$env:CLAUDE_CODE_SUBAGENT_MODEL="claude-sonnet-4-6"` antes do comando deixa o modelo forte só no orquestrador.

**Acompanhar e retomar:** `claude --resume f0-acervo` (a sessão foi nomeada no `-n`). Queda de terminal não perde nada; `/compact foque no PLAN.md e nos comandos de verificação` se a sessão inchar.

**Ao voltar, revise em 10 min:** leia `docs/RELATORIO-F0.md` conferindo as **saídas reais** (não afirmações); `git log --oneline` na main; rode você mesmo `npm run lint && npm run test && npm run build` uma vez; abra `http://localhost:3000` e faça um login. Se vier errado: regra dos 2 strikes — após duas correções falhas, não emende; peça um prompt novo com o aprendizado.

## Suposições que fiz

- O escopo da F0 é o do §7 do plano: **alicerce, sem negócio** — a migration 0001 cria só `profiles`+trigger; `empresas`/`membros`/RLS multi-tenant são a F1.
- Convite na F0 é manual pelo painel do Supabase (tela de convite e regra de domínio por empresa = F2); tema claro neutro (dark mode → backlog); nenhuma trava de domínio de e-mail.
- Driver `pg` como devDependency para os scripts de banco cross-platform (Windows sem psql) — pré-aprovado no prompt e registrado em DECISOES.
- Deploy Vercel e criação do repo GitHub são **condicionais às CLIs autenticadas** — se faltarem, a run termina mesmo assim, com pendência registrada (nada trava).
- O produto segue pt-BR only, custo R$ 0, e o repositório da WAP nunca é modificado — apenas lido como referência.
