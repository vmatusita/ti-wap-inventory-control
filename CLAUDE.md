# CLAUDE.md — Estoque TI WAP

Sistema interno de controle de ativos de TI da WAP (notebooks, celulares, monitores, desktops, tablets de 5 filiais). Substitui 3 planilhas desconectadas + relatório semanal por e-mail. Conceito central: **a movimentação é a fonte da verdade** — registra-se o evento uma vez e o estado do ativo, o estoque e os relatórios derivam por trigger no banco.

Cada fase do projeto é executada como uma **ordem de serviço** em `docs/prompts/` (F0 a F5). Execute somente a ordem que o Johnny colar na conversa. O status das fases está no `README.md`.

## Documentos-fonte (ordem de autoridade)

1. `docs/ESPECIFICACAO.md` — **o quê** construir: modelo de dados, máquina de estados (§4), vocabulários De→Para (§5), telas (§6), relatórios (§7), regras de negócio (§8).
2. `docs/PLANEJAMENTO.md` — **como**: stack fechada (§2), estratégia de dados (§3), fases (§4), definição de pronto (§6).
3. `supabase/schema.sql` — rascunho do banco. Na F1 ele vira migrations; **a partir daí, as migrations mandam** e o schema.sql passa a ser histórico.

Se o código existente, a ordem de serviço e os documentos se contradisserem: **PARE e pergunte ao Johnny**. Não resolva contradição por conta própria.

## Regras de conduta (valem em TODA sessão, sem exceção)

1. **Ambiguidade ou pré-requisito faltando → PARE e pergunte.** Não invente escopo, não "aproveite para fazer" nada fora da ordem de serviço atual.
2. **NUNCA dados reais.** Nenhum nome de colaborador real, patrimônio real ou linha das planilhas da WAP em seed, fixture, teste, comentário ou screenshot. Dados de desenvolvimento são 100% fictícios (F1). Os dados reais só entram em produção pelo importador (F4), operado pelo Johnny.
3. **Custo R$ 0.** Não habilitar nenhum recurso pago, nenhum serviço novo, nenhuma lib com licença comercial. Infra permitida: Supabase Free + Vercel (conta Pro existente do Johnny).
4. **Segredos:** nunca commitar `.env*` (mantenha `.env.example` atualizado). `SUPABASE_SERVICE_ROLE_KEY` só em código server-side ou scripts locais — jamais em Client Component ou variável `NEXT_PUBLIC_*`.
5. **Banco de produção é intocável sem confirmação explícita do Johnny na conversa.** Migrations e seed rodam no projeto de desenvolvimento/ensaio.
6. **APIs de integração: confira a documentação oficial atual antes de escrever o código** (Supabase SSR/Auth, shadcn `chart`, Next 16, Recharts v3) — use o MCP Context7 ou a doc online; não confie em API de memória.
7. **Ao terminar qualquer ordem:** `npm run lint` e `npm run build` limpos, checklist de aceite da ordem preenchido item a item no resumo final, com pendências e perguntas listadas.

## Stack (fechada — proibido adicionar dependência fora desta lista sem aprovação do Johnny)

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict**
- **Tailwind CSS v4** + **shadcn/ui** (componentes via CLI) + **Recharts v3** (só via componente `chart` do shadcn)
- **Supabase**: `@supabase/supabase-js` + `@supabase/ssr` · tipos gerados por `supabase gen types typescript`
- **Zod** + **react-hook-form** (+ `@hookform/resolvers`) · **TanStack Table** (via data-table do shadcn) · **date-fns** (locale `ptBR`) · **PapaParse** (F3 export / F4 importador) · **sonner** (toasts, via shadcn)
- Dev: **Supabase CLI**, **@faker-js/faker** (locale pt_BR, só em `scripts/`), **seedrandom**, **Vitest** (só funções puras), ESLint + Prettier
- Proibidos (decisão registrada): Prisma/Drizzle, Redux/Zustand/TanStack Query, ECharts (upgrade futuro documentado), Highcharts/AG Charts/MUI X Pro, i18n, monorepo.

## Convenções

- **Idioma:** UI, mensagens, erros e commits em **pt-BR**. Identificadores de domínio em português sem acento (`ativo`, `movimentacao`, `filial`); utilitários/infra em inglês (`getServerClient`, `formatDate`).
- **Banco:** snake_case; toda alteração via nova migration em `supabase/migrations/` (nunca editar migration já aplicada). Regras de negócio críticas (máquina de estados, RLS) vivem no Postgres — a UI é a segunda linha, nunca a única.
- **Componentes:** Server Components por padrão; `'use client'` apenas quando necessário (forms, charts, realtime). Escritas **sempre** via Server Actions com validação Zod; leituras via funções em `src/lib/queries/`.
- **shadcn:** componentes gerados ficam em `src/components/ui/` e não se editam sem motivo documentado.
- **Datas** exibidas `dd/MM/yyyy`; números em tabelas com `tabular-nums`. Patrimônio exibido sempre no formato canônico (`WAP0004491`).
- **Patrimônio repete em casos raros** — o par patrimônio + service tag é a chave (spec §5). Toda busca de ativo por patrimônio precisa tratar o caso de múltiplos resultados.

## Estrutura de pastas (prescrita — criada progressivamente pelas fases)

```
src/
  app/
    login/page.tsx                  # público
    auth/confirm/route.ts           # callback de convite/senha
    (app)/                          # grupo protegido por sessão
      layout.tsx                    # sidebar + header
      page.tsx                      # dashboard home
      ativos/page.tsx               # lista
      ativos/[id]/page.tsx          # ficha + linha do tempo
      movimentacoes/nova/page.tsx   # fluxo de nova movimentação (lote)
      relatorios/[filial]/page.tsx  # relatório por filial ('geral' = consolidado)
      admin/usuarios/page.tsx
      admin/filiais/page.tsx
      admin/motivos/page.tsx
      admin/importador/page.tsx     # F4
  components/
    ui/            # shadcn (CLI)
    layout/  ativos/  movimentacoes/  relatorios/  admin/
  lib/
    supabase/      # client.ts, server.ts, middleware de sessão
    actions/       # Server Actions (Zod dentro)
    queries/       # leituras tipadas
    validators/    # schemas Zod compartilhados
    types/database.ts   # GERADO — não editar à mão
supabase/
  migrations/      # fonte da verdade do banco a partir da F1
scripts/
  seed.ts  reset.ts     # dados fictícios (guardas anti-produção obrigatórias)
docs/  mockups/
```

Se a estrutura real divergir desta ao começar uma ordem, PARE e reporte a diferença.

## Git

- Branch por fase: `f0-fundacao`, `f1-banco-seed`, `f2-operacao`, `f3-relatorios`, `f4-importador`, `f5-<item>`. Merge na `main` só quando o checklist de aceite da fase passar (quem confere é o Johnny).
- Commits em pt, estilo conventional: `feat(f2): fluxo de movimentação em lote`, `fix(f3): fuso nas datas do relatório`.
- Proibido: push forçado na `main`, commitar `node_modules`, `.env*`, dados reais.

## Comandos do projeto

- `npm run dev` · `npm run build` · `npm run lint`
- A partir da F1: `npm run db:seed` (popula fictício), `npm run db:reset` (zera), `npm run db:types` (regenera `src/lib/types/database.ts`)
- Supabase local (opcional): `supabase start` / `supabase db reset`

## Referência visual

`mockups/dashboard-relatorio.html` é a referência de layout/estilo do relatório (F3): tema claro, acento amarelo WAP `#eda100` sobre header escuro `#111110`, azul `#2a78d6` como segunda série, KPI tiles, barras com rótulo de valor. Fonte do sistema; nada de fonte externa.
