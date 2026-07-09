# OS-F0 — Fundação (projeto, login por convite, layout, deploy)

Você é o executor desta ordem de serviço no repositório `ti-wap-inventory-control`. Siga-a na ordem, sem improvisar. Diante de ambiguidade, erro de pré-requisito ou decisão não coberta aqui: **PARE e pergunte ao Johnny**.

## 0. Antes de qualquer coisa (obrigatório)

1. Leia `CLAUDE.md` (raiz), `docs/PLANEJAMENTO.md` §1–§3 e `docs/ESPECIFICACAO.md` §3 (perfis) e §9 (arquitetura).
2. Confirme os pré-requisitos. Se QUALQUER um falhar, PARE e reporte qual:
   - A raiz do repo contém apenas: `.git/`, `CLAUDE.md`, `README.md`, `docs/`, `supabase/schema.sql`, `mockups/` (nenhum projeto Next existente).
   - `node --version` ≥ 20.
   - Existe um projeto Supabase de desenvolvimento criado pelo Johnny, com URL e chave publicável/anon em mãos (pergunte a ele; NÃO crie projeto por conta própria).

## 1. Objetivo (o que existe quando você terminar)

Um app Next.js 16 deployado na Vercel em que: usuário sem sessão só vê `/login`; um usuário convidado pelo painel do Supabase define a senha via e-mail e cai num layout autenticado vazio (sidebar + header) com seu nome e papel exibidos; contas têm papel `admin` ou `viewer` vindo da tabela `profiles`. Nenhuma tela de dados ainda.

## 2. Escopo proibido nesta ordem

- NÃO criar tabelas de negócio (`ativos`, `movimentacoes`, `filiais`, `motivos`) — isso é F1. A ÚNICA estrutura de banco criada aqui é `profiles` + trigger (tarefa 3.4).
- NÃO criar telas de ativos, movimentações, relatórios ou admin.
- NÃO adicionar dependência fora da lista do `CLAUDE.md`.
- NÃO implementar cadastro aberto (signup). Convite é a única porta de entrada.

## 3. Tarefas (executar em ordem)

### 3.1 Projeto Next.js

1. Na raiz do repo, rode `npx create-next-app@latest .` — respostas: TypeScript **sim**, ESLint **sim**, Tailwind **sim**, `src/` **sim**, App Router **sim**, import alias **`@/*`**. Se o CLI perguntar algo não listado, use o padrão. Se reclamar de diretório não-vazio por causa de `docs/` etc., use os flags equivalentes ou mova-os temporariamente — os arquivos existentes NÃO podem ser perdidos.
2. Confirme no `package.json`: `next` na linha 16.x. Se vier outra major, PARE e reporte.
3. `npx shadcn@latest init` (tema neutro, CSS variables sim). Depois adicione os componentes base: `button card input label dropdown-menu avatar separator sheet sonner skeleton badge`.
4. Crie `.env.example` com os nomes exatos (sem valores): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (comentário: "server/scripts apenas — nunca NEXT_PUBLIC"). Garanta `.env*` no `.gitignore` (menos o example).
5. `npm run dev` precisa abrir sem erro antes de seguir.

### 3.2 Clientes Supabase

1. Instale `@supabase/supabase-js @supabase/ssr`.
2. **Consulte a doc oficial atual do `@supabase/ssr` para Next.js App Router (via Context7 ou docs)** e crie, seguindo o padrão oficial vigente: `src/lib/supabase/client.ts` (browser), `src/lib/supabase/server.ts` (Server Components/Actions, com cookies) e o middleware de atualização de sessão no arquivo que o Next 16 usar para isso (`middleware.ts` ou sucessor — siga a doc, não a memória).
3. O middleware deve: manter a sessão viva e **redirecionar não-autenticado para `/login`** em toda rota exceto `/login`, `/auth/*` e assets.

### 3.3 Login e callback de convite

1. `src/app/login/page.tsx`: card centralizado com logo "WAP · Estoque TI" (texto, `bg-[#eda100]` no badge, header escuro como no mockup), campos e-mail + senha, botão "Entrar", erro em `sonner` com mensagem em pt-BR ("E-mail ou senha inválidos"). Sem link de cadastro. Link "Esqueci a senha" pode ficar desabilitado com tooltip "peça ao administrador" (v1).
2. `src/app/auth/confirm/route.ts`: route handler do fluxo de convite/definição de senha conforme a doc oficial do Supabase Auth para `@supabase/ssr` (troca do token e redirect). Usuário convidado que clica no e-mail deve conseguir definir senha e cair logado no `/`.
3. Logout: item no menu do avatar (header) chamando sign-out via Server Action e redirecionando para `/login`.

### 3.4 Profiles + papéis (única migration desta fase)

1. Inicialize o Supabase CLI no repo (`supabase init`) e vincule ao projeto dev (`supabase link`) — peça o project-ref ao Johnny.
2. Crie a migration `0001_profiles.sql` com exatamente: enum `user_role ('admin','viewer')`; tabela `public.profiles (id uuid pk → auth.users on delete cascade, nome text, role user_role not null default 'viewer', created_at timestamptz default now())`; trigger `handle_new_user` que insere profile no signup (copie do bloco correspondente em `supabase/schema.sql`); RLS habilitada com: select para authenticated (próprio perfil ou admin), update só admin. Aplique com `supabase db push` **no projeto dev**.
3. `npm run db:types` (crie o script no package.json: `supabase gen types typescript --linked > src/lib/types/database.ts`).

### 3.5 Layout autenticado

1. Grupo `(app)` com `src/app/(app)/layout.tsx`: header escuro `#111110` (badge WAP amarela + "Estoque TI" + avatar com nome e papel do profile) e sidebar com itens **desabilitados/placeholder**: Dashboard, Ativos, Movimentações, Relatórios, Administração (só admin vê Administração). Responsivo: sidebar vira `sheet` no mobile.
2. `src/app/(app)/page.tsx`: título "Dashboard" + `card` com texto "Os dados chegam na F1." — nada além disso.
3. O papel vem de `profiles` via query em `src/lib/queries/profile.ts`; um `viewer` NUNCA vê o item Administração.

### 3.6 Deploy

1. Prepare o repo para deploy (build limpo). Peça ao Johnny para conectar o repo no painel da Vercel (conta Pro dele) e configurar as duas envs públicas + a service key — **não** peça nem armazene esses valores no chat/código.
2. Confirme com ele que o deploy de produção abriu e o login funciona lá.

## 4. Critérios de aceite (o Johnny confere um a um)

- [ ] `npm run lint` e `npm run build` sem erro/warning de TS.
- [ ] Acessar `/` deslogado redireciona para `/login`.
- [ ] Convite enviado pelo painel do Supabase → e-mail → define senha → cai logado no dashboard.
- [ ] Conta com `role=admin` vê "Administração" na sidebar; `role=viewer` não vê.
- [ ] Logout volta para `/login` e `/` volta a ser bloqueado.
- [ ] Mobile 375px: layout usável, sidebar em sheet.
- [ ] Deploy de produção na Vercel abrindo e logando.
- [ ] `git log` limpo no branch `f0-fundacao`; nenhum `.env` commitado; `.env.example` atualizado.

## 5. Entrega

Trabalhe no branch `f0-fundacao`. Commits pequenos em pt (`feat(f0): ...`). Ao final, produza um resumo com: o que foi feito, o checklist acima marcado, decisões tomadas dentro do permitido, e perguntas/pendências. NÃO faça merge na `main` — quem faz é o Johnny após conferir.
