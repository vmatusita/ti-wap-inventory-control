# CLAUDE.md — Estoque TI WAP

Sistema interno de controle de ativos de TI da WAP (notebooks, celulares, monitores, desktops, tablets de 5 filiais). Substitui 3 planilhas desconectadas + relatório semanal por e-mail. Conceito central: **a movimentação é a fonte da verdade** — registra-se o evento uma vez e o estado do ativo, o estoque e os relatórios derivam por trigger no banco.

Cada fase do projeto é executada como uma **ordem de serviço** em `docs/prompts/` (F0 a F5). Execute somente a ordem que o Johnny colar na conversa. O status das fases está no `README.md`.

## Documentos-fonte (ordem de autoridade)

1. `docs/ESPECIFICACAO.md` — **o quê** construir: modelo de dados, máquina de estados (§4), vocabulários De→Para (§5), telas (§6), relatórios (§7), regras de negócio (§8).
2. `docs/PLANEJAMENTO.md` — **como**: stack fechada (§2), estratégia de dados (§3), fases (§4), definição de pronto (§6).
3. `supabase/schema.sql` — rascunho do banco. Na F1 ele vira migrations; **a partir daí, as migrations mandam** e o schema.sql passa a ser histórico.

Se o código existente, a ordem de serviço e os documentos se contradisserem: resolva pela hierarquia acima (a spec manda), **registre a decisão em `docs/DECISOES.md`** e siga — não trave.

## Modo de operação: AUTÔNOMO — acesso total (decisão do Johnny, 09/07/2026)

O Claude Code **não pede autorização**: decide, implementa, aplica migrations, roda scripts, mergeia na `main` e deploya — **inclusive direto em produção**. Perguntar ao Johnny é exceção rara, reservada a insumo físico que só ele tem (ex.: os CSVs reais, uma credencial que não existe no ambiente) — nunca para pedir permissão.

Autonomia com disciplina — práticas de **autoproteção do próprio agente** (não são autorizações):

- **Decida e registre.** Diante de ambiguidade, decida pelo que a spec indica, anote em `docs/DECISOES.md` (data · contexto · escolha · motivo) e siga. Não fique bloqueado esperando resposta.
- **Operação destrutiva em produção** (reset, carga, migration que altera/apaga dado): antes, exporte backup das tabelas afetadas; rode dry-run quando existir; confira contagens depois. Deu errado → corrija você mesmo e registre.
- **Autoverificação no lugar de aceite:** execute e marque você mesmo o checklist da ordem; o resumo final traz checklist, decisões e pendências. O Johnny audita quando quiser — nada fica esperando por ele.

## Regras permanentes (continuam valendo — não são pedidos de autorização)

1. **Escopo da ordem atual.** Não "aproveite para fazer" trabalho de outra fase — o que surgir de fora vai para o backlog no resumo.
2. **NUNCA dados reais.** Nenhum nome de colaborador real, patrimônio real ou linha das planilhas da WAP em seed, fixture, teste, comentário ou screenshot. Dados de desenvolvimento são 100% fictícios (F1). Os dados reais só entram em produção pela **carga única de go-live** (scripts da F4, executados de forma autônoma com os CSVs fornecidos pelo Johnny) — **o sistema não tem tela de importação, nunca**.
3. **Custo R$ 0.** Não habilitar nenhum recurso pago, nenhum serviço novo, nenhuma lib com licença comercial. Infra permitida: Supabase Free + Vercel (conta Pro existente do Johnny).
4. **Segredos:** nunca commitar `.env*` (mantenha `.env.example` atualizado). `SUPABASE_SERVICE_ROLE_KEY` só em código server-side ou scripts locais — jamais em Client Component ou variável `NEXT_PUBLIC_*`.
5. **Produção: acesso total, com autoproteção.** Migrations, scripts e deploy rodam direto em produção sem pedir autorização — precedidos de backup/dry-run quando destrutivos (ver Modo de operação). Seed fictício jamais roda em produção depois do go-live.
6. **APIs de integração: confira a documentação oficial atual antes de escrever o código** (Supabase SSR/Auth, shadcn `chart`, Next 16, Recharts v3) — use o MCP Context7 ou a doc online; não confie em API de memória.
7. **Ao terminar qualquer ordem:** `npm run lint` e `npm run build` limpos; checklist da ordem **autoverificado** item a item; resumo final com checklist, decisões registradas em `docs/DECISOES.md` e pendências.

## Stack (fechada — proibido adicionar dependência fora desta lista sem aprovação do Johnny)

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- **Tailwind CSS v4** + **shadcn/ui** (componentes via CLI) + **Recharts v3** (só via componente `chart` do shadcn)
- **Supabase**: `@supabase/supabase-js` + `@supabase/ssr` · tipos gerados por `supabase gen types typescript`
- **Zod** + **react-hook-form** (+ `@hookform/resolvers`) · **TanStack Table** (via data-table do shadcn) · **date-fns** (locale `ptBR`) · **PapaParse** (F3 export / scripts de carga única F4) · **sonner** (toasts, via shadcn)
- **docxtemplater** + **pizzip** (preenchem os templates `.docx` dos termos, server-side — F5A) · **docx-preview** (preview do termo no navegador). Libs **MIT**, aprovadas pelo Johnny (PLANO-TERMOS §3.1). `serverExternalPackages` no `next.config.ts`.
- Dev: **Supabase CLI**, **@faker-js/faker** (locale pt_BR, só em `scripts/`), **seedrandom**, **Vitest** (só funções puras), ESLint + Prettier
- Proibidos (decisão registrada): Prisma/Drizzle, Redux/Zustand/TanStack Query, ECharts (upgrade futuro documentado), Highcharts/AG Charts/MUI X Pro, i18n, monorepo.

## Convenções

- **Idioma:** UI, mensagens, erros e commits em **pt-BR**. Identificadores de domínio em português sem acento (`ativo`, `movimentacao`, `filial`); utilitários/infra em inglês (`getServerClient`, `formatDate`).
- **Banco:** snake_case; toda alteração via nova migration em `supabase/migrations/` (nunca editar migration já aplicada). Regras de negócio críticas (máquina de estados, RLS) vivem no Postgres — a UI é a segunda linha, nunca a única.
- **Componentes:** Server Components por padrão; `'use client'` apenas quando necessário (forms, charts, realtime). Escritas **sempre** via Server Actions com validação Zod; leituras via funções em `src/lib/queries/`.
- **shadcn:** componentes gerados ficam em `src/components/ui/` e não se editam sem motivo documentado.
- **Datas** exibidas `dd/MM/yyyy`; números em tabelas com `tabular-nums`. Patrimônio exibido sempre no formato canônico (`WAP0004491`).
- **Patrimônio repete em casos raros** — o par patrimônio + service tag é a chave (spec §5). Toda busca de ativo por patrimônio precisa tratar o caso de múltiplos resultados.
- **Modelo de acesso (spec §3):** duas portas. **Operador** = login Supabase restrito a `@wap.ind.br`, **nível único** ("admin" e "operador" são sinônimos; NUNCA criar roles/papéis). **Visualizador** = senha de acesso gerida em `admin/senhas` (hash `crypto.scrypt` nativo — proibido lib de hash) → cookie httpOnly assinado, válido só nas rotas `/relatorios/**`, queries servidas pelo servidor. Nunca expor o client administrativo ou a anon key para sessões por senha; revogação de senha tem efeito no request seguinte.

## Estrutura de pastas (prescrita — criada progressivamente pelas fases)

```
src/
  app/
    login/page.tsx                  # público — operadores (@wap.ind.br)
    auth/confirm/route.ts           # callback de convite/senha
    relatorios/acesso/page.tsx      # público — entrada por SENHA de acesso (F3)
    (app)/                          # protegido: sessão (rotas de relatório também aceitam cookie de visualização — F3)
      layout.tsx                    # sidebar + header
      page.tsx                      # dashboard home
      ativos/page.tsx               # lista
      ativos/[id]/page.tsx          # ficha + linha do tempo
      movimentacoes/nova/page.tsx   # fluxo de nova movimentação (lote)
      itens/page.tsx                # itens por quantidade: saldos + lançamento + histórico (F3B)
      relatorios/[filial]/page.tsx  # relatório AO VIVO por filial ('geral' = consolidado)
      relatorios/gerados/page.tsx        # histórico de snapshots semanais
      relatorios/gerados/[id]/page.tsx   # snapshot congelado e interativo (spec §7.1)
      admin/usuarios/page.tsx       # convites — só @wap.ind.br
      admin/senhas/page.tsx         # senhas de acesso dos relatórios (F3)
      admin/filiais/page.tsx
      admin/motivos/page.tsx
      admin/itens/page.tsx          # catálogo de itens por quantidade (F3B)
      # (não existe admin/importador — carga inicial é via scripts, spec §10)
  components/
    ui/            # shadcn (CLI)
    layout/  ativos/  movimentacoes/  relatorios/  admin/
  lib/
    supabase/      # client.ts, server.ts, middleware de sessão
    actions/       # Server Actions (Zod dentro) — inclui termos.ts (F5A)
    queries/       # leituras tipadas (ativos, movimentacoes, relatorios, itens, termos…)
    validators/    # schemas Zod compartilhados
    termos/        # tipos, mapa motivo→Descrição, ordenação do lote, datas (F5A)
    types/database.ts   # GERADO — não editar à mão
  templates/
    termos/*.docx  # 7 modelos de termo tagueados e sanitizados (F5A) — lidos em runtime
supabase/
  migrations/      # fonte da verdade do banco a partir da F1
scripts/
  seed.ts  reset.ts     # dados fictícios (guardas anti-produção obrigatórias)
  import/               # carga ÚNICA do go-live (F4) — ferramenta, não feature do app
docs/  mockups/
```

Se a estrutura real divergir desta ao começar uma ordem, PARE e reporte a diferença.

## Git

- Branch por fase é **opcional** — commit direto na `main` é permitido (modo autônomo). Se usar branch (`f0-fundacao`, `f1-banco-seed`…), **você mesmo faz o merge** quando o checklist da fase passar na autoverificação.
- Commits em pt, estilo conventional: `feat(f2): fluxo de movimentação em lote`, `fix(f3): fuso nas datas do relatório`.
- Proibido: push forçado na `main`, commitar `node_modules`, `.env*`, dados reais.

## Comandos do projeto

- `npm run dev` · `npm run build` · `npm run lint`
- A partir da F1: `npm run db:seed` (popula fictício), `npm run db:reset` (zera), `npm run db:types` (regenera `src/lib/types/database.ts`)
- Supabase local (opcional): `supabase start` / `supabase db reset`
- Só na janela do go-live (F4): `npm run carga` (`scripts/import/` — guardas obrigatórias; não é feature)

## Referência visual

`mockups/dashboard-relatorio.html` é a referência de layout/estilo do relatório (F3): tema claro, acento amarelo WAP `#eda100` sobre header escuro `#111110`, azul `#2a78d6` como segunda série, KPI tiles, barras com rótulo de valor. Fonte do sistema; nada de fonte externa.
